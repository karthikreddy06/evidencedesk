import { getSiteBaseUrl } from './controls/jira-client.js';
import { listControls } from './controls/registry.js';
import { buildControlResult } from './controls/types.js';

/**
 * Executes all registered compliance controls in parallel with per-control
 * error isolation and returns the aggregated audit report.
 *
 * @param {object} [context]
 * @returns {Promise<{
 *   generatedAt: string,
 *   site: string,
 *   summary: { pass: number, fail: number, missing_evidence: number, error: number },
 *   results: Array<import('./controls/types.js').ControlResult>
 * }>}
 */
export async function executeAudit(context) {
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

  return {
    generatedAt: new Date().toISOString(),
    site: site || context?.siteUrl || '',
    summary,
    results,
  };
}
