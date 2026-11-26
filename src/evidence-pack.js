import api, { route } from '@forge/api';

/**
 * Escapes text for safe inclusion in Confluence XHTML storage format.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a safe link if url is http(s), otherwise plain escaped text.
 *
 * @param {string} url
 * @param {string} label
 * @returns {string}
 */
function renderLink(url, label) {
  const safeLabel = escapeHtml(label || url || 'Link');
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return `<a href="${escapeHtml(url)}">${safeLabel}</a>`;
  }
  return safeLabel;
}

/**
 * Formats a Date as "YYYY-MM-DD HH:mm" in UTC.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/**
 * Builds Confluence XHTML storage format body for the audit evidence pack.
 *
 * @param {object} audit
 * @param {string} spaceKey
 * @returns {string}
 */
function buildStorageBody(audit, spaceKey) {
  const { generatedAt, site, summary, results } = audit;

  const parts = [
    '<h1>Audit Evidence Pack</h1>',
    '<p><strong>Executive Summary</strong></p>',
    '<table><tbody>',
    `<tr><th>Generated At</th><td>${escapeHtml(generatedAt)}</td></tr>`,
    `<tr><th>Site</th><td>${escapeHtml(site || 'N/A')}</td></tr>`,
    `<tr><th>Confluence Space</th><td>${escapeHtml(spaceKey)}</td></tr>`,
    `<tr><th>Pass</th><td>${escapeHtml(summary.pass)}</td></tr>`,
    `<tr><th>Fail</th><td>${escapeHtml(summary.fail)}</td></tr>`,
    `<tr><th>Missing Evidence</th><td>${escapeHtml(summary.missing_evidence)}</td></tr>`,
    `<tr><th>Error</th><td>${escapeHtml(summary.error)}</td></tr>`,
    '</tbody></table>',
  ];

  for (const control of results) {
    parts.push(
      `<h2>${escapeHtml(control.controlId)}: ${escapeHtml(control.title)}</h2>`,
      `<p><strong>Status:</strong> ${escapeHtml(control.status)} | <strong>Checked:</strong> ${escapeHtml(control.checked)}</p>`,
      `<p><strong>Reason:</strong> ${escapeHtml(control.reason)}</p>`
    );

    const hasFailures = Array.isArray(control.failures) && control.failures.length > 0;
    const rows = hasFailures ? control.failures : control.evidence || [];

    if (rows.length > 0) {
      const heading = hasFailures ? 'Failures' : 'Evidence';
      parts.push(`<p><strong>${heading}</strong></p>`);
      parts.push('<table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody>');

      for (const item of rows) {
        const label = item.issueKey || item.pageTitle || item.url || 'Item';
        const details = item.reason || item.summary || '';
        parts.push(
          `<tr><td>${renderLink(item.url, label)}</td><td>${escapeHtml(details)}</td></tr>`
        );
      }

      parts.push('</tbody></table>');
    }
  }

  return parts.join('\n');
}

/**
 * Resolves candidate Confluence spaces (either the requested spaceKey or
 * current spaces on the site).
 *
 * @param {string} [spaceKey]
 * @returns {Promise<Array<{ id: string, key: string, name: string }>>}
 */
async function findCandidateSpaces(spaceKey) {
  const targetRoute = spaceKey
    ? route`/wiki/api/v2/spaces?keys=${spaceKey}&limit=5`
    : route`/wiki/api/v2/spaces?status=current&limit=25`;

  const res = await api.asUser().requestConfluence(targetRoute, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confluence space lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const spaces = Array.isArray(data.results) ? data.results : [];
  if (spaces.length === 0) {
    throw new Error(
      spaceKey
        ? `Confluence space "${spaceKey}" was not found or is not accessible.`
        : 'No accessible Confluence spaces found for the current user.'
    );
  }
  return spaces;
}

/**
 * Creates an Audit Evidence Pack Confluence page from an audit result.
 *
 * @param {object} audit
 * @param {string} [requestedSpaceKey]
 * @returns {Promise<{ pageUrl: string, pageId: string, spaceKey: string, summary: object }>}
 */
export async function createEvidencePackPage(audit, requestedSpaceKey) {
  const trimmedKey = requestedSpaceKey?.trim();
  const spaces = await findCandidateSpaces(trimmedKey || undefined);
  const title = `Audit Evidence Pack - ${formatTimestamp(new Date())}`;

  let lastError = null;
  for (const space of spaces) {
    const bodyValue = buildStorageBody(audit, space.key);
    const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spaceId: space.id,
        status: 'current',
        title,
        body: {
          representation: 'storage',
          value: bodyValue,
        },
      }),
    });

    if (res.ok) {
      const page = await res.json();
      const base = (page._links?.base || '').replace(/\/$/, '');
      const webui = page._links?.webui || '';
      const fallbackBase = audit.site ? `${audit.site.replace(/\/$/, '')}/wiki` : '';
      const resolvedBase = base || fallbackBase;
      const pageUrl = resolvedBase && webui ? `${resolvedBase}${webui}` : webui || page.id;

      return {
        pageUrl,
        pageId: page.id,
        spaceKey: space.key,
        summary: audit.summary,
      };
    }

    const errText = await res.text();
    lastError = new Error(`Failed to create page in space "${space.key}" (${res.status}): ${errText}`);
    if (res.status !== 403 && res.status !== 401) {
      throw lastError;
    }
  }

  throw lastError || new Error('Unable to create Confluence page in any accessible space.');
}
