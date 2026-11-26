import { executeAudit } from './audit.js';
import { getControl, listControlIds } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';
import { createEvidencePackPage } from './evidence-pack.js';

/**
 * Rovo action handler for `check-control`.
 * Runs a single deterministic compliance control and returns structured JSON.
 *
 * @param {{ controlId?: string }} payload
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

  const result = await control.run(context);
  console.log(
    `[check-control] ${result.controlId} -> ${result.status} (checked=${result.checked}, failures=${result.failures.length})`
  );
  return result;
}

/**
 * Rovo action handler for `run-audit`.
 * Runs all registered controls in parallel and returns an aggregated summary.
 *
 * @param {object} _payload
 * @param {object} context
 */
export async function runAudit(_payload, context) {
  const output = await executeAudit(context);
  const { summary } = output;
  console.log(
    `[run-audit] pass=${summary.pass} fail=${summary.fail} missing_evidence=${summary.missing_evidence} error=${summary.error}`
  );
  return output;
}

/**
 * Rovo action handler for `generate-evidence-pack`.
 * Runs the full audit and publishes a Confluence Audit Evidence Pack page.
 *
 * @param {{ spaceKey?: string }} payload
 * @param {object} context
 */
export async function generateEvidencePack(payload, context) {
  const audit = await executeAudit(context);
  const result = await createEvidencePackPage(audit, payload?.spaceKey);
  console.log(
    `[generate-evidence-pack] pageId=${result.pageId} space=${result.spaceKey} url=${result.pageUrl}`
  );
  return result;
}
