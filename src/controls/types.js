/**
 * @typedef {'pass' | 'fail' | 'missing_evidence' | 'error'} ControlStatus
 *
 * @typedef {Object} ControlFailure
 * @property {string} [issueKey] - Jira issue key (e.g. "ED-12").
 * @property {string} [pageTitle] - Confluence page title.
 * @property {string} reason - Deterministic explanation of why the item failed.
 * @property {string} url - Direct browser URL to the item.
 *
 * @typedef {Object} ControlEvidence
 * @property {string} [issueKey] - Jira issue key (e.g. "ED-12").
 * @property {string} [pageTitle] - Confluence page title.
 * @property {string} url - Direct browser URL to the item.
 * @property {string} [summary] - Item summary or details.
 * @property {string | null} [assignee] - Assignee display name, or null if unassigned.
 * @property {string | null} [resolution] - Resolution name, or null if unresolved.
 *
 * @typedef {Object} ControlResult
 * @property {string} controlId - Control identifier (e.g. "C1").
 * @property {string} title - Short human-readable title of the control.
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
  title = '',
  status,
  checked,
  reason,
  failures = [],
  evidence = [],
}) {
  return {
    controlId,
    title,
    status,
    checked,
    reason,
    failures,
    evidence,
  };
}
