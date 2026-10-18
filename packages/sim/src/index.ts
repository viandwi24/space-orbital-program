/**
 * @orbital/sim — headless simulation loop (fixed timestep). Runs in Bun (tests, CI harness) and in
 * a Web Worker (apps/web). Environment-neutral: no DOM, no Bun/Node APIs, no clock.
 * See docs/architecture/simulation.md.
 */
export { API_VERSION } from '@orbital/core';
export { KEPLER_VERSION } from '@orbital/kepler';
export const SIM_VERSION = '0.1.0';

export { createSim } from './sim.ts';
export type { DispatchOptions, Sim, SimOptions } from './sim.ts';
export type { TerrainFactory } from './bodies.ts';
export * from './constants.ts';
export { recordReplay, verifyReplay, type ReplayRecorder, type ReplayVerdict } from './replay.ts';
