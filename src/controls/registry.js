import { controlC1 } from './c1-done-assignee-resolution.js';

const CONTROLS = new Map([
  [controlC1.id, controlC1],
]);

/**
 * Looks up a control by ID (case-insensitive).
 *
 * @param {string} controlId
 * @returns {typeof controlC1 | undefined}
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
