import api, { route } from '@forge/api';

export const DEFAULT_MAX_PAGES = 20;
export const PAGE_SIZE = 100;

/**
 * Resolves the Jira/Confluence site base URL for constructing clickable links.
 * Falls back to empty string if unavailable so links degrade gracefully.
 *
 * @param {object} [context]
 * @returns {Promise<string>}
 */
export async function getSiteBaseUrl(context) {
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
 * Queries Jira issues via POST /rest/api/3/search/jql with full nextPageToken
 * pagination up to maxPages. Returns jqlError if Jira rejects the JQL (e.g.
 * missing issue type or field on the site) so controls can return missing_evidence.
 *
 * @param {string} jql
 * @param {string[]} fields
 * @param {number} [maxPages]
 * @returns {Promise<{ issues: Array<object>, truncated: boolean, cap: number, jqlError?: string }>}
 */
export async function searchJiraIssues(jql, fields, maxPages = DEFAULT_MAX_PAGES) {
  const issues = [];
  let nextPageToken = undefined;
  let truncated = false;
  const cap = maxPages * PAGE_SIZE;

  for (let page = 0; page < maxPages; page += 1) {
    const body = {
      jql,
      fields,
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
      if (res.status === 400) {
        return {
          issues: [],
          truncated: false,
          cap,
          jqlError: text,
        };
      }
      throw new Error(`Jira search failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (Array.isArray(data.issues)) {
      issues.push(...data.issues);
    }

    if (data.isLast || !data.nextPageToken) {
      break;
    }

    if (page === maxPages - 1) {
      truncated = true;
      break;
    }

    nextPageToken = data.nextPageToken;
  }

  return { issues, truncated, cap };
}
