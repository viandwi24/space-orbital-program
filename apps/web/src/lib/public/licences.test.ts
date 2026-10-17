/** Every package of the workspace says the game's licence (plan 075, ADR 0106). */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const read = (dir: string) =>
	JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
		name?: string;
		license?: string;
		workspaces?: { packages: string[] };
	};

/** The root `workspaces` globs, which are all `<folder>/*`. */
function workspaceDirs(): string[] {
	const globs = read(root).workspaces?.packages ?? [];
	return globs.flatMap((glob) => {
		expect(glob).toMatch(/^[\w-]+\/\*$/);
		const parent = join(root, glob.slice(0, -2));
		return readdirSync(parent, { withFileTypes: true })
			.filter((e) => e.isDirectory() && existsSync(join(parent, e.name, 'package.json')))
			.map((e) => join(parent, e.name));
	});
}

describe('package licences', () => {
	it('the root and every workspace package.json say Apache-2.0', () => {
		const dirs = [root, ...workspaceDirs()];
		expect(dirs.length).toBeGreaterThanOrEqual(12);
		const wrong = dirs
			.map((dir) => ({ name: read(dir).name ?? dir, license: read(dir).license }))
			.filter((p) => p.license !== 'Apache-2.0');
		expect(wrong).toEqual([]);
	});
});
