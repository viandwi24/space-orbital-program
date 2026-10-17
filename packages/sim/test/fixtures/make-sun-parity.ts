/**
 * Writes `sun-parity.json` (plan 122): the parity flight's states with the stock system as it was
 * before the Sun (home planet at the root). Run once on that code; never regenerate it after.
 */
import { runParity } from '../helpers/sun-parity.ts';

await Bun.write(
	new URL('./sun-parity.json', import.meta.url),
	`${JSON.stringify(await runParity(), null, 1)}\n`
);
