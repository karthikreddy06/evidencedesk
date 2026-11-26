import { getSiteBaseUrl, normalizeProjectKey, scopeJql, searchJiraIssues } from './jira-client.js';
import { buildControlResult } from './types.js';

const TITLE = 'Done issues have assignee and resolution';

/**
 * C1: Every Jira issue in statusCategory Done must have an assignee and a resolution.
 */
export const controlC1 = {
  id: 'C1',
  title: TITLE,
  description: 'Every Jira issue in statusCategory Done has an assignee and a resolution.',

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const projectKey = normalizeProjectKey(context?.projectKey);
    const jql = scopeJql('statusCategory = Done', projectKey);

    const [baseUrl, searchResult] = await Promise.all([
      getSiteBaseUrl(context),
      searchJiraIssues(jql, ['summary', 'assignee', 'resolution']),
    ]);

    if (searchResult.jqlError) {
      return buildControlResult({
        controlId: 'C1',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: `Unable to query Done issues on this site: ${searchResult.jqlError}`,
        failures: [],
        evidence: [],
      });
    }

    const { issues, truncated, cap } = searchResult;

    if (issues.length === 0) {
      return buildControlResult({
        controlId: 'C1',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'No Jira issues found with statusCategory = Done.',
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
    const baseReason =
      failures.length === 0
        ? `All ${issues.length} Done issue(s) have an assignee and a resolution.`
        : `${failures.length} of ${issues.length} Done issue(s) are missing an assignee or resolution.`;
    const capNote = truncated
      ? ` (Safety cap of ${cap} issues reached; remaining issues were not evaluated.)`
      : '';

    return buildControlResult({
      controlId: 'C1',
      title: TITLE,
      status,
      checked: issues.length,
      reason: `${baseReason}${capNote}`,
      failures,
      evidence,
    });
  },
};
