import api, { route } from '@forge/api';
import { getSiteBaseUrl, searchJiraIssues } from './jira-client.js';
import { buildControlResult } from './types.js';

const TITLE = 'Done Change, Task, and Story issues have traceability links';
const TARGET_ISSUE_TYPES = new Set(['Change', 'Task', 'Story']);

/**
 * Checks whether a Jira issue has at least one remote link.
 *
 * @param {string} issueKey
 * @returns {Promise<boolean>}
 */
async function hasRemoteLink(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`);
  if (!res.ok) {
    return false;
  }
  const links = await res.json();
  return Array.isArray(links) && links.length > 0;
}

/**
 * C3: Done issues of type Change, Task, or Story must have at least one
 * issue link or remote link.
 */
export const controlC3 = {
  id: 'C3',
  title: TITLE,
  description: 'Done Change, Task, and Story issues must have at least one issue link or remote link.',

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const [baseUrl, searchResult] = await Promise.all([
      getSiteBaseUrl(context),
      searchJiraIssues('statusCategory = Done', ['summary', 'issuetype', 'issuelinks']),
    ]);

    if (searchResult.jqlError) {
      return buildControlResult({
        controlId: 'C3',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: `Unable to query Jira issues on this site: ${searchResult.jqlError}`,
        failures: [],
        evidence: [],
      });
    }

    const matchingIssues = searchResult.issues.filter((issue) =>
      TARGET_ISSUE_TYPES.has(issue.fields?.issuetype?.name)
    );

    if (matchingIssues.length === 0) {
      return buildControlResult({
        controlId: 'C3',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'No Done issues of type Change, Task, or Story found.',
        failures: [],
        evidence: [],
      });
    }

    const failures = [];
    const evidence = [];

    for (const issue of matchingIssues) {
      const key = issue.key;
      const fields = issue.fields || {};
      const url = baseUrl ? `${baseUrl}/browse/${key}` : key;
      const issueLinks = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
      const linked = issueLinks.length > 0 || (await hasRemoteLink(key));

      if (!linked) {
        failures.push({
          issueKey: key,
          reason: `${fields.issuetype?.name || 'Issue'} has no issue links or remote links`,
          url,
        });
      }

      evidence.push({
        issueKey: key,
        url,
        summary: `${fields.issuetype?.name || 'Issue'}: ${fields.summary || ''}`,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const baseReason =
      failures.length === 0
        ? `All ${matchingIssues.length} Done Change/Task/Story issue(s) have at least one issue or remote link.`
        : `${failures.length} of ${matchingIssues.length} Done Change/Task/Story issue(s) have no issue or remote links.`;
    const capNote = searchResult.truncated
      ? ` (Safety cap of ${searchResult.cap} issues reached; remaining issues were not evaluated.)`
      : '';

    return buildControlResult({
      controlId: 'C3',
      title: TITLE,
      status,
      checked: matchingIssues.length,
      reason: `${baseReason}${capNote}`,
      failures,
      evidence,
    });
  },
};
