import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const ID = 'virtual:plan-status';
const RESOLVED = '\0' + ID;

/** Each plan's `status:` field, keyed by its three-digit number. */
export function readPlanStatus(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const file of readdirSync(dir)) {
		const m = /^(\d{3})-.*\.md$/.exec(file);
		if (!m) continue;
		const status = /^status: (\S+)/m.exec(readFileSync(join(dir, file), 'utf8'))?.[1];
		if (status) out[m[1]] = status;
	}
	return out;
}

/**
 * `virtual:plan-status` (plan 076): the plans' status at build time, so the public roadmap labels an
 * item in progress or shipped from its plan file without bundling the plans themselves.
 */
export function planStatus(dir: string): Plugin {
	return {
		name: 'plan-status',
		resolveId: (id) => (id === ID ? RESOLVED : undefined),
		load(id) {
			if (id !== RESOLVED) return;
			for (const file of readdirSync(dir)) this.addWatchFile(join(dir, file));
			return `export default ${JSON.stringify(readPlanStatus(dir))};`;
		}
	};
}
