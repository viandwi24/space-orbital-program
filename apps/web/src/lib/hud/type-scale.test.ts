import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

/** Plan 250 (rancangan §7.6): the HUD panels use the one type scale, not the legacy --t-xs/--t-sm. */
test.each(['OrbitStrip', 'ResourcesPanel', 'CrewPanel'])('%s uses no legacy type token', (name) => {
	const source = readFileSync(new URL(`./${name}.svelte`, import.meta.url), 'utf8');
	expect(source).not.toMatch(/--t-(xs|sm)\b/);
});
