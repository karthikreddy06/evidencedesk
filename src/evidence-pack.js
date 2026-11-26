import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

const MAX_ROWS_PER_CONTROL = 25;
const DEDUPE_TTL_MS = 5 * 60 * 1000;

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
 * Formats a Date as "YYYY-MM-DD HH:mm:ss" in UTC.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatTimestampSeconds(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

/**
 * Builds a deterministic KVS key for deduplicating evidence pack creation.
 *
 * @param {string} site
 * @param {string | null} projectKey
 * @returns {string}
 */
function buildDedupeKey(site, projectKey) {
  const safeSite = String(site || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeProject = String(projectKey || 'ALL').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `pack:${safeSite}:${safeProject}`.slice(0, 450);
}

/**
 * Returns a recently created evidence pack (within 5 minutes) for the same
 * site and projectKey, or null if none exists or it has expired.
 *
 * @param {string} site
 * @param {string | null} projectKey
 * @returns {Promise<{ pageUrl: string, pageId: string, spaceKey: string, summary: object } | null>}
 */
export async function getRecentEvidencePack(site, projectKey) {
  try {
    const key = buildDedupeKey(site, projectKey);
    const cached = await kvs.get(key);
    if (!cached || !cached.createdAtMs || !cached.pageId) {
      return null;
    }
    if (Date.now() - cached.createdAtMs > DEDUPE_TTL_MS) {
      return null;
    }
    return {
      pageUrl: cached.pageUrl,
      pageId: cached.pageId,
      spaceKey: cached.spaceKey,
      summary: cached.summary,
    };
  } catch (err) {
    console.warn(`[evidence-pack] KVS read failed: ${err?.message}`);
    return null;
  }
}

/**
 * Stores the newly created evidence pack metadata in Forge KVS for dedupe.
 *
 * @param {string} site
 * @param {string | null} projectKey
 * @param {{ pageUrl: string, pageId: string, spaceKey: string, summary: object }} record
 */
async function saveRecentEvidencePack(site, projectKey, record) {
  try {
    const key = buildDedupeKey(site, projectKey);
    await kvs.set(key, {
      ...record,
      createdAtMs: Date.now(),
    });
  } catch (err) {
    console.warn(`[evidence-pack] KVS write failed: ${err?.message}`);
  }
}

/**
 * Builds Confluence XHTML storage format body for the audit evidence pack.
 * Caps failure/evidence tables at 25 rows per control and states the full count.
 *
 * @param {object} audit
 * @param {string} spaceKey
 * @returns {string}
 */
function buildStorageBody(audit, spaceKey) {
  const { generatedAt, site, projectKey, summary, results } = audit;

  const parts = [
    '<h1>Audit Evidence Pack</h1>',
    '<p><strong>Executive Summary</strong></p>',
    '<table><tbody>',
    `<tr><th>Generated At</th><td>${escapeHtml(generatedAt)}</td></tr>`,
    `<tr><th>Site</th><td>${escapeHtml(site || 'N/A')}</td></tr>`,
    `<tr><th>Project Scope</th><td>${escapeHtml(projectKey || 'ALL')}</td></tr>`,
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
    const allRows = hasFailures ? control.failures : control.evidence || [];

    if (allRows.length > 0) {
      const shownRows = allRows.slice(0, MAX_ROWS_PER_CONTROL);
      const heading = hasFailures ? 'Failures' : 'Evidence';
      const countNote =
        allRows.length > MAX_ROWS_PER_CONTROL
          ? ` (showing ${MAX_ROWS_PER_CONTROL} of ${allRows.length})`
          : ` (${allRows.length})`;

      parts.push(`<p><strong>${heading}${escapeHtml(countNote)}</strong></p>`);
      parts.push('<table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody>');

      for (const item of shownRows) {
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
 * Posts a new page to Confluence REST API v2, retrying once with a short
 * random suffix if Confluence returns 400 for a duplicate title.
 *
 * @param {string} spaceId
 * @param {string} title
 * @param {string} bodyValue
 * @returns {Promise<Response>}
 */
async function postConfluencePage(spaceId, title, bodyValue) {
  const attempt = async (pageTitle) =>
    api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spaceId,
        status: 'current',
        title: pageTitle,
        body: {
          representation: 'storage',
          value: bodyValue,
        },
      }),
    });

  const res = await attempt(title);
  if (res.status === 400) {
    const errText = await res.text();
    if (/already exists/i.test(errText)) {
      const suffix = Math.random().toString(36).slice(2, 6);
      return attempt(`${title} (${suffix})`);
    }
    return new Response(errText, { status: res.status, statusText: res.statusText });
  }
  return res;
}

/**
 * Creates an Audit Evidence Pack Confluence page from an audit result and
 * caches the result in Forge KVS for 5 minutes.
 *
 * @param {object} audit
 * @param {string} [requestedSpaceKey]
 * @returns {Promise<{ pageUrl: string, pageId: string, spaceKey: string, summary: object }>}
 */
export async function createEvidencePackPage(audit, requestedSpaceKey) {
  const trimmedKey = requestedSpaceKey?.trim();
  const spaces = await findCandidateSpaces(trimmedKey || undefined);
  const scopeLabel = audit.projectKey || 'ALL';
  const title = `Audit Evidence Pack - ${scopeLabel} - ${formatTimestampSeconds(new Date())}`;

  let lastError = null;
  for (const space of spaces) {
    const bodyValue = buildStorageBody(audit, space.key);
    const res = await postConfluencePage(space.id, title, bodyValue);

    if (res.ok) {
      const page = await res.json();
      const base = (page._links?.base || '').replace(/\/$/, '');
      const webui = page._links?.webui || '';
      const fallbackBase = audit.site ? `${audit.site.replace(/\/$/, '')}/wiki` : '';
      const resolvedBase = base || fallbackBase;
      const pageUrl = resolvedBase && webui ? `${resolvedBase}${webui}` : webui || page.id;

      const result = {
        pageUrl,
        pageId: page.id,
        spaceKey: space.key,
        summary: audit.summary,
      };
      await saveRecentEvidencePack(audit.site, audit.projectKey, result);
      return result;
    }

    const errText = await res.text();
    lastError = new Error(`Failed to create page in space "${space.key}" (${res.status}): ${errText}`);
    if (res.status !== 403 && res.status !== 401) {
      throw lastError;
    }
  }

  throw lastError || new Error('Unable to create Confluence page in any accessible space.');
}
