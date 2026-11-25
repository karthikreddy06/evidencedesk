import api, { route } from '@forge/api';
import { buildControlResult } from './types.js';

const MAX_PAGES = 5;
const PAGE_SIZE = 100;

/**
 * Resolves the Jira site base URL for constructing clickable browse links.
 * Falls back to empty string if unavailable so links degrade gracefully.
 *
 * @param {object} [context]
 * @returns {Promise<string>}
 */
async function getSiteBaseUrl(context) {
  if (context?.siteUrl) {
    return context.siteUrl.replace(/\/$/, '');
  }

  const res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  if (!res.ok) {
    return '';
  }
  const info = await res.json();
  return (info.baseUrl || '').replace(/\/$/, '');
}

/**
 * Fetches Jira issues in status "Done" using /rest/api/3/search/jql.
 *
 * @returns {Promise<Array<object>>}
 */
async function fetchDoneIssues() {
  const issues = [];
  let nextPageToken = undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = {
      jql: 'status = "Done"',
      fields: ['summary', 'status', 'assignee', 'resolution'],
      maxResults: PAGE_SIZE,
      ...(nextPageToken ? { nextPageToken } : {}),
    };

    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (Array.isArray(data.issues)) {
      issues.push(...data.issues);
    }

    if (data.isLast || !data.nextPageToken) {
      break;
    }
    nextPageToken = data.nextPageToken;
  }

  return issues;
}

/**
 * C1: Every Jira issue in status Done must have an assignee and a resolution.
 */
export const controlC1 = {
  id: 'C1',
  name: 'Done issues have assignee and resolution',
  description: 'Every Jira issue in status Done has an assignee and a resolution.',

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const [baseUrl, issues] = await Promise.all([
      getSiteBaseUrl(context),
      fetchDoneIssues(),
    ]);

    if (issues.length === 0) {
      return buildControlResult({
        controlId: 'C1',
        status: 'missing_evidence',
        checked: 0,
        reason: 'No Jira issues found in status Done.',
        failures: [],
        evidence: [],
      });
    }

    const failures = [];
    const evidence = [];

    for (const issue of issues) {
      const key = issue.key;
      const fields = issue.fields || {};
      const assigneeName = fields.assignee?.displayName || null;
      const resolutionName = fields.resolution?.name || null;
      const url = baseUrl ? `${baseUrl}/browse/${key}` : key;

      const missing = [];
      if (!fields.assignee) {
        missing.push('assignee');
      }
      if (!fields.resolution) {
        missing.push('resolution');
      }

      if (missing.length > 0) {
        failures.push({
          issueKey: key,
          reason: `Missing ${missing.join(' and ')}`,
          url,
        });
      }

      evidence.push({
        issueKey: key,
        url,
        summary: fields.summary || '',
        assignee: assigneeName,
        resolution: resolutionName,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const reason =
      failures.length === 0
        ? `All ${issues.length} Done issue(s) have an assignee and a resolution.`
        : `${failures.length} of ${issues.length} Done issue(s) are missing an assignee or resolution.`;

    return buildControlResult({
      controlId: 'C1',
      status,
      checked: issues.length,
      reason,
      failures,
      evidence,
    });
  },
};
