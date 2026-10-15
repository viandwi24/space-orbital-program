/**
 * @orbital/sim — headless simulation loop (fixed timestep). Implemented by plan 003+.
 * Must run in Bun (tests, CI harness) and in a Web Worker (apps/web).
 */
export { API_VERSION } from '@orbital/core';
export { KEPLER_VERSION } from '@orbital/kepler';
export const SIM_VERSION = '0.0.0';
