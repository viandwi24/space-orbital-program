/**
 * Builds docs/roadmap/release-roadmap.html from the release plans (docs/plans/2NN-*.md) and the
 * coordination tags (ADR 0112): waves from `depends`, the critical path, a three-stream schedule,
 * and each plan's state, which is one of:
 * - done: `status: done` on this branch;
 * - ready: a `ready/NNN` tag exists;
 * - wip: a `claim/NNN` tag exists, or the plan is `in-progress`;
 * - todo: none of the above.
 *
 * Usage: `bun run roadmap:release` (remote tags) or `bun run roadmap:release --local`.
 * Workers run it in every completion commit (docs/roadmap/worker-brief.md).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PLANS = join(ROOT, 'docs/plans');
const TEMPLATE = join(ROOT, 'tools/release-roadmap.template.html');
const OUT = join(ROOT, 'docs/roadmap/release-roadmap.html');
const HOURS: Record<string, number> = { S: 0.75, M: 1.25, L: 2.25, XL: 4 };
const MERGE = 0.3;

/** Track (colour group) per plan; new plans default to the nearest group by number. */
const TRACK: Record<string, string> = {
	'200': 'FIX',
	'201': 'FIX',
	'202': 'OPS',
	'203': 'DBG',
	'204': 'SHELL',
	'205': 'SHELL',
	'206': 'SHELL',
	'207': 'PARTS',
	'208': 'PARTS',
	'209': 'PARTS',
	'210': 'PARTS',
	'211': 'PARTS',
	'212': 'PARTS',
	'213': 'PARTS',
	'214': 'UI',
	'215': 'UI',
	'216': 'KEYS',
	'217': 'HANGAR',
	'218': 'HANGAR',
	'219': 'HANGAR',
	'220': 'HANGAR',
	'221': 'VESSEL',
	'222': 'VESSEL',
	'223': 'VESSEL',
	'224': 'NAV',
	'225': 'EVA',
	'226': 'PRES',
	'227': 'PRES',
	'228': 'PRES',
	'229': 'PRES',
	'230': 'SHELL',
	'231': 'CAREER',
	'232': 'QA',
	'233': 'UI',
	'234': 'SC',
	'235': 'SC',
	'236': 'SC',
	'237': 'FIX',
	'238': 'HANGAR',
	'239': 'FIX',
	'240': 'PARTS',
	'241': 'PARTS',
	'242': 'PARTS',
	'243': 'HANGAR',
	'244': 'HANGAR',
	'245': 'KEYS',
	'246': 'PRES',
	'247': 'SHELL',
	'248': 'SHELL',
	'249': 'EVA',
	'250': 'UI',
	'251': 'GFX',
	'252': 'GFX',
	'253': 'GFX',
	'254': 'PARTS',
	'255': 'HANGAR',
	'256': 'UI',
	'257': 'FIX',
	'258': 'NAV',
	'259': 'SC',
	'262': 'FIX',
	'263': 'FIX'
};

interface Plan {
	id: string;
	slug: string;
	title: string;
	size: string;
	track: string;
	deps: string[];
	adr: string;
	state: 'done' | 'ready' | 'wip' | 'todo';
	who: string;
	wave: number;
	ef: number;
}

const plans: Record<string, Plan> = {};
for (const file of readdirSync(PLANS)
	.filter((f) => /^2\d\d-.+\.md$/.test(f))
	.sort()) {
	const text = await Bun.file(join(PLANS, file)).text();
	const fm = (k: string) => text.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
	const id = fm('id').replace(/"/g, '');
	const deps = fm('depends')
		.replace(/[[\]"\s]/g, '')
		.split(',')
		.filter(Boolean);
	const size = text.match(/\*\*Size:\*\*\s*(XL|S|M|L)/)?.[1] ?? 'M';
	const adrs = [...new Set([...text.matchAll(/\b(0[12]\d\d)\b/g)].map((m) => m[1]!))].filter(
		(a) => a >= '0200'
	);
	const status = fm('status');
	const owner = fm('owner').replace(/"/g, '');
	plans[id] = {
		id,
		slug: file.replace(/^\d{3}-|\.md$/g, ''),
		title: fm('title').replace(/^"|"$/g, ''),
		size,
		track: TRACK[id] ?? 'QA',
		deps,
		adr: adrs.slice(0, 3).join(', ') || '—',
		state: status === 'done' ? 'done' : status === 'in-progress' ? 'wip' : 'todo',
		who: status === 'done' ? '' : owner,
		wave: 0,
		ef: 0
	};
}
const ids = Object.keys(plans).sort();
// Dependencies outside the release set (e.g. 133) count as already met.
for (const p of Object.values(plans)) p.deps = p.deps.filter((d) => plans[d]);

// ---- tags ----
let tags: string[] = [];
let source = 'remote origin';
if (!process.argv.includes('--local')) {
	const r = Bun.spawnSync(['git', 'ls-remote', '--tags', 'origin'], { cwd: ROOT, stderr: 'pipe' });
	if (r.exitCode === 0)
		tags = r.stdout
			.toString()
			.split('\n')
			.map((l) => l.split('\t')[1] ?? '')
			.filter((t) => t.startsWith('refs/tags/') && !t.endsWith('^{}'))
			.map((t) => t.slice(10));
}
if (tags.length === 0) {
	source = 'local tags';
	tags = Bun.spawnSync(['git', 'tag', '-l'], { cwd: ROOT })
		.stdout.toString()
		.split('\n')
		.filter(Boolean);
}
// Who holds a claim: the annotated claim tag's message ("Worker D (M2)"), read from local tags after a fetch.
if (source === 'remote origin')
	Bun.spawnSync(['git', 'fetch', '-q', 'origin', '--tags', '--force'], {
		cwd: ROOT,
		stderr: 'pipe'
	});
const claimedBy = new Map<string, string>();
for (const line of Bun.spawnSync(
	['git', 'for-each-ref', 'refs/tags/claim', '--format=%(refname:short)|%(contents:subject)'],
	{ cwd: ROOT }
)
	.stdout.toString()
	.split('\n')) {
	const [ref, subject] = line.split('|');
	if (ref && subject) claimedBy.set(ref.slice('claim/'.length), subject.trim());
}
for (const p of Object.values(plans)) {
	if (p.state === 'done') continue;
	if (tags.includes(`ready/${p.id}`)) p.state = 'ready';
	else if (tags.includes(`claim/${p.id}`)) p.state = 'wip';
	if (p.state !== 'todo' && tags.includes(`claim/${p.id}`)) p.who = claimedBy.get(p.id) || p.who;
}

// ---- waves, critical path, a three-stream schedule ----
const cost = (p: Plan) => HOURS[p.size]! + MERGE;
const wave = (id: string): number => {
	const p = plans[id]!;
	if (p.wave || p.deps.length === 0) return p.wave;
	return (p.wave = 1 + Math.max(...p.deps.map(wave)));
};
const ef = (id: string): number => {
	const p = plans[id]!;
	if (p.ef) return p.ef;
	return (p.ef = cost(p) + Math.max(0, ...p.deps.map(ef)));
};
for (const id of ids) {
	wave(id);
	ef(id);
}
const end = ids.reduce((a, b) => (plans[b]!.ef > plans[a]!.ef ? b : a));
const critical = [end];
while (plans[critical.at(-1)!]!.deps.length) {
	const d = plans[critical.at(-1)!]!.deps;
	critical.push(d.reduce((a, b) => (plans[b]!.ef > plans[a]!.ef ? b : a)));
}
critical.reverse();
const kids: Record<string, string[]> = Object.fromEntries(
	ids.map((i) => [i, ids.filter((j) => plans[j]!.deps.includes(i))])
);
const rem: Record<string, number> = {};
const remOf = (id: string): number =>
	(rem[id] ??= cost(plans[id]!) + Math.max(0, ...kids[id]!.map(remOf)));
function schedule(n: number): { span: number; at: Record<string, [number, number, number]> } {
	const done: Record<string, number> = {};
	const free = new Array(n).fill(0);
	const at: Record<string, [number, number, number]> = {};
	const left = new Set(ids);
	while (left.size) {
		const ready = [...left].filter((p) => plans[p]!.deps.every((d) => d in done));
		const lane = free.indexOf(Math.min(...free));
		const startOf = (p: string) => Math.max(free[lane], ...plans[p]!.deps.map((d) => done[d]!));
		const best = ready.reduce((a, b) =>
			startOf(b) < startOf(a) || (startOf(b) === startOf(a) && remOf(b) > remOf(a)) ? b : a
		);
		const s = startOf(best);
		done[best] = s + cost(plans[best]!);
		free[lane] = done[best]!;
		at[best] = [lane, +s.toFixed(2), +done[best]!.toFixed(2)];
		left.delete(best);
	}
	return { span: +Math.max(...Object.values(done)).toFixed(1), at };
}
const s3 = schedule(3);
const makespan = { '1': schedule(1).span, '2': schedule(2).span, '3': s3.span };

const stamp = new Date().toLocaleString('id-ID', {
	timeZone: 'Asia/Jakarta',
	dateStyle: 'medium',
	timeStyle: 'short'
});
const data = {
	plans,
	critical,
	sched: s3.at,
	makespan,
	cp: +plans[end]!.ef.toFixed(1),
	generated: stamp,
	source
};
const html = (await Bun.file(TEMPLATE).text()).replace('__DATA__', JSON.stringify(data));
await Bun.write(OUT, html);
const n = (s: string) => ids.filter((i) => plans[i]!.state === s).length;
console.log(
	`release-roadmap: ${n('done')}/${ids.length} done, ${n('wip')} in progress, ${n('ready')} waiting for merge, ${n('todo')} to do (${source})`
);
