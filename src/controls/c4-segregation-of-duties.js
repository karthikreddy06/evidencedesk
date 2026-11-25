import { getSiteBaseUrl, searchJiraIssues } from './jira-client.js';
import { buildControlResult } from './types.js';

const TITLE = 'Segregation of duties on Done Change issues';

/**
 * C4: For Done issues of type Change, assignee must not equal reporter.
 * Issues with no assignee are skipped (covered by C1).
 */
export const controlC4 = {
  id: 'C4',
  title: TITLE,
  description: 'For Done Change issues, assignee accountId must differ from reporter accountId.',

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const [baseUrl, searchResult] = await Promise.all([
      getSiteBaseUrl(context),
      searchJiraIssues('statusCategory = Done AND issuetype = "Change"', [
        'summary',
        'assignee',
        'reporter',
      ]),
    ]);

    if (searchResult.jqlError) {
      return buildControlResult({
        controlId: 'C4',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'Issue type "Change" does not exist on this Jira site or cannot be queried.',
        failures: [],
        evidence: [],
      });
    }

    const assignedChanges = searchResult.issues.filter((issue) => Boolean(issue.fields?.assignee));

    if (assignedChanges.length === 0) {
      return buildControlResult({
        controlId: 'C4',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'No assigned Done issues of type Change found.',
        failures: [],
        evidence: [],
      });
    }

    const failures = [];
    const evidence = [];

    for (const issue of assignedChanges) {
      const key = issue.key;
      const fields = issue.fields || {};
      const url = baseUrl ? `${baseUrl}/browse/${key}` : key;
      const assigneeId = fields.assignee?.accountId;
      const reporterId = fields.reporter?.accountId;

      if (assigneeId && reporterId && assigneeId === reporterId) {
        failures.push({
          issueKey: key,
          reason: `Assignee and reporter are the same user (${fields.assignee?.displayName || assigneeId})`,
          url,
        });
      }

      evidence.push({
        issueKey: key,
        url,
        summary: fields.summary || '',
        assignee: fields.assignee?.displayName || null,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const baseReason =
      failures.length === 0
        ? `All ${assignedChanges.length} assigned Done Change issue(s) have distinct assignee and reporter.`
        : `${failures.length} of ${assignedChanges.length} assigned Done Change issue(s) have the same assignee and reporter.`;
    const capNote = searchResult.truncated
      ? ` (Safety cap of ${searchResult.cap} issues reached; remaining issues were not evaluated.)`
      : '';

    return buildControlResult({
      controlId: 'C4',
      title: TITLE,
      status,
      checked: assignedChanges.length,
      reason: `${baseReason}${capNote}`,
      failures,
      evidence,
    });
  },
};
