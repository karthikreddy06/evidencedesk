import { executeAudit, runControlWithBudget } from './audit.js';
import { normalizeProjectKey } from './controls/jira-client.js';
import { getControl, listControlIds } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';
import { createEvidencePackPage } from './evidence-pack.js';

/**
 * Rovo action handler for `check-control`.
 * Runs a single deterministic compliance control and returns structured JSON.
 *
 * @param {{ controlId?: string, projectKey?: string }} payload
 * @param {object} context
 */
export async function checkControl(payload, context) {
  const requestedId = payload?.controlId || 'C1';
  const control = getControl(requestedId);

  if (!control) {
    return buildControlResult({
      controlId: String(requestedId),
      title: 'Unknown control',
      status: 'missing_evidence',
      checked: 0,
      reason: `Unknown control "${requestedId}". Available controls: ${listControlIds().join(', ')}.`,
      failures: [],
      evidence: [],
    });
  }

  let projectKey = null;
  try {
    projectKey = normalizeProjectKey(payload?.projectKey);
  } catch (err) {
    return buildControlResult({
      controlId: control.id,
      title: control.title || control.id,
      status: 'error',
      checked: 0,
      reason: err.message,
      failures: [],
      evidence: [],
    });
  }

  const result = await runControlWithBudget(control, { ...context, projectKey });
  console.log(
    `[check-control] ${result.controlId} project=${projectKey || 'ALL'} -> ${result.status} (checked=${result.checked}, failures=${result.failures.length})`
  );
  return result;
}

/**
 * Rovo action handler for `run-audit`.
 * Runs all registered controls in parallel and returns an aggregated summary.
 *
 * @param {{ projectKey?: string }} payload
 * @param {object} context
 */
export async function runAudit(payload, context) {
  const output = await executeAudit({ ...context, projectKey: payload?.projectKey });
  const { summary } = output;
  console.log(
    `[run-audit] project=${output.projectKey || 'ALL'} pass=${summary.pass} fail=${summary.fail} missing_evidence=${summary.missing_evidence} error=${summary.error}`
  );
  return output;
}

/**
 * Rovo action handler for `generate-evidence-pack`.
 * Runs the full audit and publishes a Confluence Audit Evidence Pack page.
 *
 * @param {{ spaceKey?: string, projectKey?: string }} payload
 * @param {object} context
 */
export async function generateEvidencePack(payload, context) {
  const audit = await executeAudit({ ...context, projectKey: payload?.projectKey });
  const result = await createEvidencePackPage(audit, payload?.spaceKey);
  console.log(
    `[generate-evidence-pack] pageId=${result.pageId} space=${result.spaceKey} project=${audit.projectKey || 'ALL'} url=${result.pageUrl}`
  );
  return result;
}
