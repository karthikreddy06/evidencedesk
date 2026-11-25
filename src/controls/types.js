/**
 * @typedef {'pass' | 'fail' | 'missing_evidence'} ControlStatus
 *
 * @typedef {Object} ControlFailure
 * @property {string} issueKey - Jira issue key (e.g. "ED-12").
 * @property {string} reason - Deterministic explanation of why the issue failed.
 * @property {string} url - Direct browser URL to the Jira issue.
 *
 * @typedef {Object} ControlEvidence
 * @property {string} issueKey - Jira issue key (e.g. "ED-12").
 * @property {string} url - Direct browser URL to the Jira issue.
 * @property {string} [summary] - Issue summary.
 * @property {string | null} [assignee] - Assignee display name, or null if unassigned.
 * @property {string | null} [resolution] - Resolution name, or null if unresolved.
 *
 * @typedef {Object} ControlResult
 * @property {string} controlId - Control identifier (e.g. "C1").
 * @property {ControlStatus} status - Deterministic compliance outcome.
 * @property {number} checked - Total number of records evaluated.
 * @property {string} reason - Human-readable summary of the outcome.
 * @property {ControlFailure[]} failures - List of non-compliant items.
 * @property {ControlEvidence[]} evidence - Evidence records with links.
 */

/**
 * Builds a normalized ControlResult object.
 *
 * @param {ControlResult} result
 * @returns {ControlResult}
 */
export function buildControlResult({
  controlId,
  status,
  checked,
  reason,
  failures = [],
  evidence = [],
}) {
  return {
    controlId,
    status,
    checked,
    reason,
    failures,
    evidence,
  };
}
