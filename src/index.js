import { getSiteBaseUrl } from './controls/jira-client.js';
import { getControl, listControlIds, listControls } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';

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
 * Runs all registered controls, isolates per-control errors, and returns an
 * aggregated audit summary.
 *
 * @param {object} _payload
 * @param {object} context
 */
export async function runAudit(_payload, context) {
  const controls = listControls();
  const [site, results] = await Promise.all([
    getSiteBaseUrl(context).catch(() => ''),
    Promise.all(
      controls.map(async (control) => {
        try {
          return await control.run(context);
        } catch (err) {
          return buildControlResult({
            controlId: control.id,
            title: control.title || control.id,
            status: 'error',
            checked: 0,
            reason: err?.message || 'Unexpected error while evaluating control.',
            failures: [],
            evidence: [],
          });
        }
      })
    ),
  ]);

  const summary = {
    pass: 0,
    fail: 0,
    missing_evidence: 0,
    error: 0,
  };

  for (const result of results) {
    if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
      summary[result.status] += 1;
    } else {
      summary.error += 1;
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    site: site || context?.siteUrl || '',
    summary,
    results,
  };

  console.log(
    `[run-audit] pass=${summary.pass} fail=${summary.fail} missing_evidence=${summary.missing_evidence} error=${summary.error}`
  );
  return output;
}
