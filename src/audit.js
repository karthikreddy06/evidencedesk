import { getSiteBaseUrl, normalizeProjectKey } from './controls/jira-client.js';
import { listControls } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';

export const CONTROL_TIMEOUT_MS = 12000;

/**
 * Runs a single control with a per-control timeout budget and error isolation.
 * Always returns a valid ControlResult including `title`.
 *
 * @param {object} control
 * @param {object} [context]
 * @returns {Promise<import('./controls/types.js').ControlResult>}
 */
export async function runControlWithBudget(control, context) {
  let timerId;
  const timeoutSec = Math.round(CONTROL_TIMEOUT_MS / 1000);

  const timeoutPromise = new Promise((resolve) => {
    timerId = setTimeout(() => {
      resolve(
        buildControlResult({
          controlId: control.id,
          title: control.title || control.id,
          status: 'error',
          checked: 0,
          reason: `timed out after ${timeoutSec}s`,
          failures: [],
          evidence: [],
        })
      );
    }, CONTROL_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    try {
      const result = await control.run(context);
      return {
        ...result,
        title: result.title || control.title || control.id,
      };
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
  })();

  try {
    return await Promise.race([runPromise, timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Executes all registered compliance controls in parallel with per-control
 * timeout and error isolation, returning the aggregated audit report.
 *
 * @param {object} [context]
 * @returns {Promise<{
 *   generatedAt: string,
 *   site: string,
 *   projectKey: string | null,
 *   summary: { pass: number, fail: number, missing_evidence: number, error: number },
 *   results: Array<import('./controls/types.js').ControlResult>
 * }>}
 */
export async function executeAudit(context) {
  const projectKey = normalizeProjectKey(context?.projectKey);
  const scopedContext = { ...context, projectKey };
  const controls = listControls();

  const [site, results] = await Promise.all([
    getSiteBaseUrl(scopedContext).catch(() => ''),
    Promise.all(controls.map((control) => runControlWithBudget(control, scopedContext))),
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

  return {
    generatedAt: new Date().toISOString(),
    site: site || context?.siteUrl || '',
    projectKey,
    summary,
    results,
  };
}
