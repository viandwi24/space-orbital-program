/**
 * The atmosphere (simulation.md, ADR 0204): the functions live in `@orbital/core` since plan 347
 * (ADR 0296 point 6), so mods predict with the sim's own air; re-exported here for the sim.
 */
export { ambientAt, machDragFactor, MACH_DRAG_CURVE, temperatureAt } from '@orbital/core';
