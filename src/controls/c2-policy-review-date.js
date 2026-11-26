import api, { assumeTrustedRoute, route } from '@forge/api';
import { getSiteBaseUrl } from './jira-client.js';
import { buildControlResult } from './types.js';

const MAX_AGE_DAYS = 365;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const POLICY_LABEL = 'policy';
const MAX_PAGES = 10;
const TITLE = `Confluence policy pages reviewed within ${MAX_AGE_DAYS} days`;

/**
 * Searches for Confluence pages labeled "policy" via CQL search API
 * (`label = "policy" AND type = page`), expanding content.version.
 *
 * @returns {Promise<{ pages: Array<object>, wikiBase: string }>}
 */
async function fetchPolicyPages() {
  const pages = [];
  let nextPath = null;
  let wikiBase = '';
  const cql = `label = "${POLICY_LABEL}" AND type = page`;

  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum += 1) {
    const targetRoute = nextPath
      ? assumeTrustedRoute(nextPath)
      : route`/wiki/rest/api/search?cql=${cql}&expand=content.version&limit=100`;

    const res = await api.asUser().requestConfluence(targetRoute, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Confluence CQL search failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (!wikiBase && data._links?.base) {
      wikiBase = data._links.base.replace(/\/$/, '');
    }

    if (Array.isArray(data.results)) {
      for (const item of data.results) {
        const content = item.content || item;
        if (content && (!content.status || content.status === 'current')) {
          pages.push({
            id: content.id,
            title: content.title || item.title,
            versionDate: content.version?.when || null,
            webui: content._links?.webui || item.url || '',
          });
        }
      }
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
    const [{ pages, wikiBase }, fallbackSiteUrl] = await Promise.all([
      fetchPolicyPages(),
      getSiteBaseUrl(context),
    ]);

    if (pages.length === 0) {
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

    for (const page of pages) {
      const pageTitle = page.title || `Page ${page.id}`;
      const webui = page.webui || `/pages/viewpage.action?pageId=${page.id}`;
      const url = base && !webui.startsWith('http') ? `${base}${webui}` : webui;

      if (!page.versionDate) {
        failures.push({
          pageTitle,
          reason: 'Latest version date is missing',
          url,
        });
        evidence.push({ pageTitle, url, summary: 'Missing version date' });
        continue;
      }

      const ageDays = Math.floor((nowMs - new Date(page.versionDate).getTime()) / MS_PER_DAY);
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
        summary: `Last updated ${ageDays} day(s) ago (${page.versionDate})`,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const reason =
      failures.length === 0
        ? `All ${pages.length} policy page(s) were updated within ${MAX_AGE_DAYS} days.`
        : `${failures.length} of ${pages.length} policy page(s) have not been updated within ${MAX_AGE_DAYS} days.`;

    return buildControlResult({
      controlId: 'C2',
      title: TITLE,
      status,
      checked: pages.length,
      reason,
      failures,
      evidence,
    });
  },
};
