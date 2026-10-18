/**
 * The Worker boundary (plan 118, ADR 0163 point 1, ADR 0101 point 2): planning work never runs in
 * the sim Worker. Walks the static import graphs of both Worker entries in the app's sources.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT =
	/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveLocal(from: string, spec: string): string | undefined {
	const base = resolve(dirname(from), spec);
	for (const c of [base, `${base}.ts`, `${base}.svelte.ts`, `${base}/index.ts`]) {
		if (existsSync(c) && c.endsWith('.ts')) return c;
	}
	return undefined;
}

/** Every local file and every package specifier reachable from `entry`. */
function graph(entry: string): { files: Set<string>; packages: Set<string> } {
	const files = new Set<string>();
	const packages = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (files.has(file)) continue;
		files.add(file);
		for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
			const spec = m[1] ?? m[2]!;
			if (spec.startsWith('.')) {
				const next = resolveLocal(file, spec);
				if (next) queue.push(next);
			} else packages.add(spec);
		}
	}
	return { files, packages };
}

describe('the planning Worker boundary', () => {
	it('the sim Worker never reaches the planning code', () => {
		const sim = graph(resolve(here, '../sim.worker.ts'));
		expect(sim.files.size).toBeGreaterThan(3);
		expect([...sim.packages]).toContain('@orbital/sim');
		expect([...sim.files].filter((f) => f.includes('comms-planning'))).toEqual([]);
	});

	it('the planning Worker never reaches the sim', () => {
		const planning = graph(resolve(here, 'planning.worker.ts'));
		expect([...planning.files].some((f) => f.endsWith('timeline.ts'))).toBe(true);
		expect([...planning.packages].filter((p) => p.startsWith('@orbital/sim'))).toEqual([]);
		expect([...planning.files].filter((f) => /sim-host|sim\.worker/.test(f))).toEqual([]);
	});
});
