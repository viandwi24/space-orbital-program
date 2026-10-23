/**
 * Writes `sun-parity.json` (plan 122): the parity flight's states with the stock system as it was
 * before the Sun (home planet at the root). Run once on that code; never regenerate it after, unless
 * the flight's physics change on purpose. Re-frozen once in plan 212 (temperature curves and the
 * transonic drag rise change the ascent) and again in plan 264 (cylinder colliders: the pad contact
 * at liftoff moves the ascent by about 1e-5 of its length), and again in plan 380 (realistic part
 * stats, ADR 0317): it pins the flight against unintended change.
 */
import { runParity } from '../helpers/sun-parity.ts';

await Bun.write(
	new URL('./sun-parity.json', import.meta.url),
	`${JSON.stringify(await runParity(), null, 1)}\n`
);
