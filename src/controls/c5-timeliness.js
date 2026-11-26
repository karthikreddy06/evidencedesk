import { getSiteBaseUrl, normalizeProjectKey, scopeJql, searchJiraIssues } from './jira-client.js';
import { buildControlResult } from './types.js';

const MAX_RESOLUTION_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TARGET_PRIORITIES = new Set(['Highest', 'Critical']);
const TITLE = `Highest/Critical bugs resolved within ${MAX_RESOLUTION_DAYS} days`;

/**
 * C5: Resolved bugs with priority Highest or Critical must be resolved within
 * MAX_RESOLUTION_DAYS (7 days) of creation.
 */
export const controlC5 = {
  id: 'C5',
  title: TITLE,
  description: `Resolved Highest or Critical bugs must have resolutiondate minus created <= ${MAX_RESOLUTION_DAYS} days.`,

  /**
   * @param {object} [context]
   * @returns {Promise<import('./types.js').ControlResult>}
   */
  async run(context) {
    const projectKey = normalizeProjectKey(context?.projectKey);
    const jql = scopeJql('issuetype = "Bug" AND resolution is not EMPTY', projectKey);

    const [baseUrl, searchResult] = await Promise.all([
      getSiteBaseUrl(context),
      searchJiraIssues(jql, ['summary', 'priority', 'created', 'resolutiondate']),
    ]);

    if (searchResult.jqlError) {
      return buildControlResult({
        controlId: 'C5',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'Issue type "Bug" or resolution field cannot be queried on this Jira site.',
        failures: [],
        evidence: [],
      });
    }

    const matchingBugs = searchResult.issues.filter(
      (issue) =>
        TARGET_PRIORITIES.has(issue.fields?.priority?.name) &&
        issue.fields?.created &&
        issue.fields?.resolutiondate
    );

    if (matchingBugs.length === 0) {
      return buildControlResult({
        controlId: 'C5',
        title: TITLE,
        status: 'missing_evidence',
        checked: 0,
        reason: 'No resolved Bugs with priority Highest or Critical found.',
        failures: [],
        evidence: [],
      });
    }

    const failures = [];
    const evidence = [];

    for (const issue of matchingBugs) {
      const key = issue.key;
      const fields = issue.fields || {};
      const url = baseUrl ? `${baseUrl}/browse/${key}` : key;
      const createdMs = new Date(fields.created).getTime();
      const resolvedMs = new Date(fields.resolutiondate).getTime();
      const elapsedDays = (resolvedMs - createdMs) / MS_PER_DAY;

      if (elapsedDays > MAX_RESOLUTION_DAYS) {
        failures.push({
          issueKey: key,
          reason: `Resolved in ${elapsedDays.toFixed(1)} days (limit: ${MAX_RESOLUTION_DAYS} days)`,
          url,
        });
      }

      evidence.push({
        issueKey: key,
        url,
        summary: `[${fields.priority?.name}] ${fields.summary || ''} (${elapsedDays.toFixed(1)}d)`,
      });
    }

    const status = failures.length === 0 ? 'pass' : 'fail';
    const baseReason =
      failures.length === 0
        ? `All ${matchingBugs.length} resolved Highest/Critical Bug(s) were resolved within ${MAX_RESOLUTION_DAYS} days.`
        : `${failures.length} of ${matchingBugs.length} resolved Highest/Critical Bug(s) exceeded ${MAX_RESOLUTION_DAYS} days.`;
    const capNote = searchResult.truncated
      ? ` (Safety cap of ${searchResult.cap} issues reached; remaining issues were not evaluated.)`
      : '';

    return buildControlResult({
      controlId: 'C5',
      title: TITLE,
      status,
      checked: matchingBugs.length,
      reason: `${baseReason}${capNote}`,
      failures,
      evidence,
    });
  },
};
