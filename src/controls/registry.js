import { controlC1 } from './c1-done-assignee-resolution.js';
import { controlC3 } from './c3-traceability.js';
import { controlC4 } from './c4-segregation-of-duties.js';
import { controlC5 } from './c5-timeliness.js';

const CONTROLS = new Map([
  [controlC1.id, controlC1],
  [controlC3.id, controlC3],
  [controlC4.id, controlC4],
  [controlC5.id, controlC5],
]);

/**
 * Looks up a control by ID (case-insensitive).
 *
 * @param {string} controlId
 * @returns {object | undefined}
 */
export function getControl(controlId) {
  if (!controlId || typeof controlId !== 'string') {
    return undefined;
  }
  return CONTROLS.get(controlId.trim().toUpperCase());
}

/**
 * Lists all registered control IDs.
 *
 * @returns {string[]}
 */
export function listControlIds() {
  return Array.from(CONTROLS.keys());
}

/**
 * Returns all registered control definitions.
 *
 * @returns {Array<object>}
 */
export function listControls() {
  return Array.from(CONTROLS.values());
}
