import api, { assumeTrustedRoute, route } from '@forge/api';
import { getSiteBaseUrl } from './jira-client.js';
import { buildControlResult } from './types.js';

const MAX_AGE_DAYS = 365;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const POLICY_LABEL = 'policy';
const TITLE = `Confluence policy pages reviewed within ${MAX_AGE_DAYS} days`;

/**
 * Looks up the Confluence label ID for "policy" via REST API v2.
 *
 * @returns {Promise<string | null>}
 */
async function findPolicyLabelId() {
  const res = await api.asUser().requestConfluence(
    route`/wiki/api/v2/labels?name=${POLICY_LABEL}`,
    { headers: { Accept: 'application/json' } }
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confluence label lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const match = (data.results || []).find(
    (label) => label.name?.toLowerCase() === POLICY_LABEL
  );
  return match?.id || null;
}

/**
 * Fetches all pages tagged with the given label ID via Confluence REST API v2.
 *
 * @param {string} labelId
 * @returns {Promise<{ pages: Array<object>, wikiBase: string }>}
 */
async function fetchPagesForLabel(labelId) {
  const pages = [];
  let nextPath = null;
  let wikiBase = '';

  for (let pageNum = 0; pageNum < 20; pageNum += 1) {
    const targetRoute = nextPath
      ? assumeTrustedRoute(nextPath)
      : route`/wiki/api/v2/labels/${labelId}/pages?limit=100`;

    const res = await api.asUser().requestConfluence(targetRoute, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Confluence pages lookup failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (!wikiBase && data._links?.base) {
      wikiBase = data._links.base.replace(/\/$/, '');
    }
    if (Array.isArray(data.results)) {
      pages.push(...data.results);
    }

    nextPath = data._links?.next || null;
    if (!nextPath) {
      break;
    }
  }

  return { pages, wikiBase };
}

/**
 * C2: Confluence pages with label "policy" must have a latest version date
 * within 365 days.
 */
export const controlC2 = {
  id: 'C2',
  title: TITLE,
  description: `Confluence pages labeled "${POLICY_LABEL}" must be updated within ${MAX_AGE_DAYS} days.`,

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const labelId = await findPolicyLabelId();
    if (!labelId) {
      return buildControlResult({
        controlId: 'C2',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: `No Confluence pages found with label "${POLICY_LABEL}".`,
        failures: [],
        evidence: [],
      });
    }

    const [{ pages, wikiBase }, fallbackSiteUrl] = await Promise.all([
      fetchPagesForLabel(labelId),
      getSiteBaseUrl(context),
    ]);

    const currentPages = pages.filter((page) => !page.status || page.status === 'current');
    if (currentPages.length === 0) {
      return buildControlResult({
        controlId: 'C2',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: `No current Confluence pages found with label "${POLICY_LABEL}".`,
        failures: [],
        evidence: [],
      });
    }

    const base = wikiBase || (fallbackSiteUrl ? `${fallbackSiteUrl}/wiki` : '');
    const nowMs = Date.now();
    const failures = [];
    const evidence = [];

    for (const page of currentPages) {
      const pageTitle = page.title || `Page ${page.id}`;
      const webui = page._links?.webui || `/pages/viewpage.action?pageId=${page.id}`;
      const url = base ? `${base}${webui}` : webui;
      const versionDate = page.version?.createdAt;

      if (!versionDate) {
        failures.push({
          pageTitle,
          reason: 'Latest version date is missing',
          url,
        });
        evidence.push({ pageTitle, url, summary: 'Missing version date' });
        continue;
      }

      const ageDays = Math.floor((nowMs - new Date(versionDate).getTime()) / MS_PER_DAY);
      if (ageDays > MAX_AGE_DAYS) {
        failures.push({
          pageTitle,
          reason: `Last updated ${ageDays} days ago (limit: ${MAX_AGE_DAYS} days)`,
          url,
        });
      }

      evidence.push({
        pageTitle,
        url,
        summary: `Last updated ${ageDays} day(s) ago (${versionDate})`,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const reason =
      failures.length === 0
        ? `All ${currentPages.length} policy page(s) were updated within ${MAX_AGE_DAYS} days.`
        : `${failures.length} of ${currentPages.length} policy page(s) have not been updated within ${MAX_AGE_DAYS} days.`;

    return buildControlResult({
      controlId: 'C2',
      title: TITLE,
      status,
      checked: currentPages.length,
      reason,
      failures,
      evidence,
    });
  },
};
