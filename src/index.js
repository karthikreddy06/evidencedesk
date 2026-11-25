import { getControl, listControlIds } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';

/**
 * Rovo action handler for `check-control`.
 * Runs a deterministic compliance control and returns structured JSON.
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
