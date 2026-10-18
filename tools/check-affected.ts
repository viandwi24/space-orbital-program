/**
 * Checks for what changed (ADR 0126): the laptop runs only the checks a change can break; the full
 * suite runs in CI (.github/workflows/ci.yml) on every handover tag and every push to `main`.
 *
 * Changed files = commits since the merge base with `--base` (default `origin/main`), plus staged,
 * unstaged and untracked files. A changed workspace pulls in every workspace that depends on it.
 * Steps, one at a time and stopping at the first failure:
 *   prettier on the changed files · docs:check · typecheck of the affected workspaces ·
 *   bun test of the affected workspaces · web vitest of the tests related to the change
 *   (`--changed`, 2 workers) · optional `--build` · optional `--e2e <file>` (Chromium).
 *
 * Usage:
 *   bun run check:affected                   the usual run before a handover or a merge
 *   bun run check:affected --dry             print what would run
 *   bun run check:affected --full            everything, still one step at a time (CI fallback)
 *   bun run check:affected --lint-only       only prettier on the changed files (used by CI)
 *   bun run check:affected --base <ref>      compare with another ref
 *   bun run check:affected --build --e2e e2e/smoke.e2e.ts
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
	const i = args.indexOf(f);
	return i >= 0 ? args[i + 1] : undefined;
};
const BASE_REF = opt('--base') ?? 'origin/main';
const DRY = flag('--dry');
const FULL = flag('--full');

const git = (...a: string[]) => {
	const r = Bun.spawnSync(['git', ...a], { cwd: ROOT, stderr: 'pipe' });
	if (r.exitCode !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr.toString().trim()}`);
	return r.stdout.toString().trim();
};
const lines = (s: string) => s.split('\n').filter(Boolean);

// ---- changed files ----------------------------------------------------------
const base = git('merge-base', BASE_REF, 'HEAD');
const changed = [
	...new Set([
		...lines(git('diff', '--name-only', `${base}...HEAD`)),
		...lines(git('diff', '--name-only', 'HEAD')),
		...lines(git('ls-files', '--others', '--exclude-standard'))
	])
].sort();

// ---- workspaces and their dependents ----------------------------------------
interface Ws {
	dir: string;
	name: string;
	deps: string[];
	scripts: Record<string, string>;
}
const workspaces: Ws[] = [];
for (const group of ['packages', 'apps', 'mods', 'examples', 'tools']) {
	if (!existsSync(join(ROOT, group))) continue;
	for (const d of readdirSync(join(ROOT, group))) {
		const pj = join(ROOT, group, d, 'package.json');
		if (!existsSync(pj)) continue;
		const json = await Bun.file(pj).json();
		const all = { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies };
		workspaces.push({
			dir: `${group}/${d}`,
			name: json.name,
			deps: Object.keys(all).filter((n) => n.startsWith('@orbital/') && n !== json.name),
			scripts: json.scripts ?? {}
		});
	}
}
const byName = new Map(workspaces.map((w) => [w.name, w]));

// Root files that can change every result: run everything.
const GLOBAL =
	/^(package\.json|bun\.lock|tsconfig[^/]*\.json|bunfig\.toml|\.prettierrc[^/]*|\.prettierignore)$/;
const global = FULL || changed.some((f) => GLOBAL.test(f));

const direct = new Set<string>();
for (const f of changed) {
	const w = workspaces.find((w) => f.startsWith(w.dir + '/'));
	if (w) direct.add(w.name);
}
const affected = new Set(global ? workspaces.map((w) => w.name) : direct);
for (let grew = true; grew;) {
	grew = false;
	for (const w of workspaces) {
		if (!affected.has(w.name) && w.deps.some((d) => affected.has(d))) {
			affected.add(w.name);
			grew = true;
		}
	}
}
const WEB = '@orbital/web';
const webAffected = affected.has(WEB);
const libs = [...affected].map((n) => byName.get(n)!).filter((w) => w.name !== WEB);

// ---- steps ------------------------------------------------------------------
interface Step {
	label: string;
	cmd: string[];
	cwd?: string;
}
const steps: Step[] = [];
const formattable = changed.filter((f) => existsSync(join(ROOT, f)));
if (FULL) steps.push({ label: 'prettier (all)', cmd: ['bunx', 'prettier', '--check', '.'] });
else if (formattable.length)
	steps.push({
		label: `prettier (${formattable.length} changed files)`,
		cmd: ['bunx', 'prettier', '--check', '--ignore-unknown', ...formattable]
	});

if (!flag('--lint-only')) {
	steps.push({ label: 'docs:check', cmd: ['bun', 'run', 'docs:check'] });
	const typed = libs.filter((w) => w.scripts.typecheck);
	if (typed.length)
		steps.push({
			label: `typecheck (${typed.length} workspaces)`,
			cmd: ['bun', 'run', ...typed.flatMap((w) => ['--filter', w.name]), 'typecheck']
		});
	if (webAffected)
		steps.push({ label: 'typecheck (web)', cmd: ['bun', 'run', '--filter', WEB, 'check'] });
	const tested = libs.filter(
		(w) => existsSync(join(ROOT, w.dir, 'test')) || existsSync(join(ROOT, w.dir, 'src'))
	);
	if (tested.length)
		steps.push({
			label: `bun test (${tested.length} workspaces)`,
			cmd: ['bun', 'test', ...tested.map((w) => `./${w.dir}`)]
		});
	if (webAffected)
		steps.push({
			label:
				FULL || global
					? 'web vitest (all, 2 workers)'
					: 'web vitest (related to the change, 2 workers)',
			cmd: [
				'bunx',
				'vitest',
				'run',
				'--maxWorkers=2',
				'--passWithNoTests',
				...(FULL || global ? [] : ['--changed', base])
			],
			cwd: join(ROOT, 'apps/web')
		});
	if (flag('--build') || FULL) steps.push({ label: 'build', cmd: ['bun', 'run', 'build'] });
	const e2e = opt('--e2e');
	if (e2e)
		steps.push({
			label: `e2e ${e2e} (chromium)`,
			cmd: ['bunx', 'playwright', 'test', '--project=chromium', e2e],
			cwd: join(ROOT, 'apps/web')
		});
}

// ---- run ----------------------------------------------------------------------
const short = base.slice(0, 7);
console.log(`check-affected: base ${BASE_REF} @ ${short}, ${changed.length} changed files`);
console.log(
	`  changed workspaces: ${[...direct].join(', ') || 'none'}${global ? ' (root config changed: all)' : ''}`
);
console.log(`  affected (with dependents): ${[...affected].join(', ') || 'none'}`);
if (steps.length === 0) {
	console.log('check-affected: nothing to check');
	process.exit(0);
}
for (const s of steps) console.log(`  - ${s.label}`);
if (DRY) process.exit(0);

const started = performance.now();
for (const s of steps) {
	const t = performance.now();
	console.log(`\n▶ ${s.label}`);
	const r = Bun.spawnSync(s.cmd, { cwd: s.cwd ?? ROOT, stdout: 'inherit', stderr: 'inherit' });
	const sec = ((performance.now() - t) / 1000).toFixed(1);
	if (r.exitCode !== 0) {
		console.error(`\n✗ ${s.label} failed after ${sec} s`);
		process.exit(r.exitCode ?? 1);
	}
	console.log(`✓ ${s.label} (${sec} s)`);
}
console.log(
	`\ncheck-affected: all passed in ${((performance.now() - started) / 1000).toFixed(1)} s`
);
