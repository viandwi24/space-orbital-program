/**
 * Roadmap progress (ADR 0112): combines the coordination tags (roadmap §3.2) with the per-agent
 * state files `docs/roadmap/state/agent-N.md`, then writes
 *  - docs/roadmap/progress.md — per agent, per phase and per plan;
 *  - the PROGRESS block of docs/roadmap/roadmap-graph.html — so the visual page shows the state.
 *
 * Usage:
 *   bun run roadmap:progress           tags from the remote `origin` (falls back to local tags)
 *   bun run roadmap:progress --local   local tags only
 *   bun run roadmap:progress --print   print the summary, write nothing (for the owner)
 * Only Agent 1 commits the generated files.
 */
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const ROADMAP = join(ROOT, 'docs/roadmap/team-development-roadmap.md');
const STATE = (n: number) => join(ROOT, `docs/roadmap/state/agent-${n}.md`);
const OUT_MD = join(ROOT, 'docs/roadmap/progress.md');
const OUT_HTML = join(ROOT, 'docs/roadmap/roadmap-graph.html');

type Status = 'done' | 'bounce' | 'ready' | 'wip' | 'open' | 'wait';
type Agent = 1 | 2 | 3;
interface Plan {
	id: string;
	title: string;
	agent: Agent;
	phase: number;
	cp: string;
	deps: string[];
	status: Status;
	note: string;
}
interface AgentState {
	now: string;
	waiting: string;
	updated: string;
	rows: Map<string, { status: string; note: string }>;
}

const LABEL: Record<Status, string> = {
	done: 'done',
	bounce: 'bounced',
	ready: 'waiting for merge',
	wip: 'in progress',
	open: 'can start',
	wait: 'waiting'
};
const AGENT: Record<Agent, string> = {
	1: 'Agent 1 · Lead (M5)',
	2: 'Agent 2 · Dev B (M2)',
	3: 'Agent 3 · Dev C (Linux)'
};
const print = process.argv.includes('--print');

// ---- plans from §4.5 ------------------------------------------------------
const roadmap = await Bun.file(ROADMAP).text();
const ROW =
	/^\| (\d{3}) (.+?) \| [SMLX]+(?: \(index\))? \| A([123]) \| [\d.]+–[\d.]+ \| (.+?) \| .+? \| `(cp\/f(\d)-\d{3}-[^`]+)` \|$/gm;
const plans: Plan[] = [];
for (const m of roadmap.matchAll(ROW)) {
	plans.push({
		id: m[1]!,
		title: m[2]!.replace(/(?: [¹²])+$/, ''),
		agent: Number(m[3]) as Agent,
		deps: [...m[4]!.matchAll(/cp\/f\d-(\d{3})-/g)].map((d) => d[1]!),
		cp: m[5]!,
		phase: Number(m[6]),
		status: 'wait',
		note: ''
	});
}
if (plans.length === 0) throw new Error('roadmap-progress: no plan rows found in roadmap §4.5');
const byId = new Map(plans.map((p) => [p.id, p]));

// ---- state files ------------------------------------------------------------
const state = {} as Record<Agent, AgentState>;
for (const n of [1, 2, 3] as const) {
	const f = Bun.file(STATE(n));
	const text = (await f.exists()) ? await f.text() : '';
	const line = (k: string) =>
		text.match(new RegExp(`^\\*\\*${k}:\\*\\* (.*)$`, 'm'))?.[1]?.trim() ?? '';
	const rows = new Map<string, { status: string; note: string }>();
	for (const r of text.matchAll(/^\| (\d{3}) [^|]*\| ([a-z-]+) \|[^|]*\|[^|]*\| ?(.*?) ?\|$/gm)) {
		rows.set(r[1]!, { status: r[2]!, note: r[3]! });
	}
	state[n] = { now: line('Now'), waiting: line('Waiting for'), updated: line('Updated'), rows };
}

// ---- tags -------------------------------------------------------------------
let source = 'remote origin';
let tags: string[] = [];
if (!process.argv.includes('--local')) {
	const r = Bun.spawnSync(['git', 'ls-remote', '--tags', 'origin'], { cwd: ROOT, stderr: 'pipe' });
	if (r.exitCode === 0) {
		tags = r.stdout
			.toString()
			.split('\n')
			.map((l) => l.split('\t')[1] ?? '')
			.filter((t) => t.startsWith('refs/tags/') && !t.endsWith('^{}'))
			.map((t) => t.slice('refs/tags/'.length));
	} else console.warn('roadmap-progress: remote not reachable, using local tags');
}
if (tags.length === 0) {
	source = 'local tags';
	tags = Bun.spawnSync(['git', 'tag', '-l'], { cwd: ROOT })
		.stdout.toString()
		.split('\n')
		.filter(Boolean);
}
const has = (t: string) => tags.includes(t);

// ---- status: tags win, then the owner's state file, then the dependencies ---
for (const p of plans) {
	const row = state[p.agent].rows.get(p.id);
	p.note = row?.note ?? '';
	if (has(p.cp)) p.status = 'done';
	else if (has(`bounce/${p.id}`) || row?.status === 'bounced') p.status = 'bounce';
	else if (has(`ready/${p.id}`) || row?.status === 'handed-over') p.status = 'ready';
	else if (has(`claim/${p.id}`) || row?.status === 'in-progress') p.status = 'wip';
}
for (const p of plans) {
	if (p.status === 'wait')
		p.status = p.deps.every((d) => byId.get(d)?.status === 'done') ? 'open' : 'wait';
}
const gates = tags.filter((t) => /^cp\/f\d-done$/.test(t));
const prep = tags.filter((t) => /^(ready|bounce)\/prep-/.test(t));

// ---- progress.md ------------------------------------------------------------
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const done = plans.filter((p) => p.status === 'done').length;
const bar = (n: number, of: number) => {
	const f = of ? Math.round((n / of) * 20) : 0;
	return '█'.repeat(f) + '░'.repeat(20 - f);
};
const list = (ps: Plan[]) => (ps.length ? ps.map((p) => p.id).join(', ') : '—');
const missing = (p: Plan) =>
	p.deps.filter((d) => byId.get(d)?.status !== 'done').map((d) => `${d} (A${byId.get(d)?.agent})`);
const cell = (s: string) => (s || '—').replace(/\|/g, '\\|');

let md = `# Roadmap progress

> Generated by \`bun run roadmap:progress\` on ${stamp} from ${source} and \`state/agent-*.md\` (ADR 0112). Do not edit by hand. Each agent's own words are in [\`state/\`](state/); the visual view is [\`roadmap-graph.html\`](roadmap-graph.html).

**${done} of ${plans.length} plans done** \`${bar(done, plans.length)}\` · phase gates: ${gates.length ? gates.map((g) => `\`${g}\``).join(', ') : 'none yet'}

## Per agent

| Agent | Done | In progress | Waiting for merge | Bounced | Now (from its state file) | Waiting for | Updated |
|---|---|---|---|---|---|---|---|
`;
for (const a of [1, 2, 3] as const) {
	const mine = plans.filter((p) => p.agent === a);
	const of = (s: Status) => mine.filter((p) => p.status === s);
	const st = state[a];
	md += `| [${AGENT[a]}](state/agent-${a}.md) | ${of('done').length}/${mine.length} | ${list(of('wip'))} | ${list(of('ready'))} | ${list(of('bounce'))} | ${cell(st.now)} | ${cell(st.waiting)} | ${cell(st.updated)} |\n`;
}

md += `\n## Per phase\n\n| Phase | Done | Progress | Not done yet |\n|---|---|---|---|\n`;
for (const ph of [1, 2, 3, 4, 5, 6]) {
	const ps = plans.filter((p) => p.phase === ph);
	const d = ps.filter((p) => p.status === 'done').length;
	md += `| F${ph}${has(`cp/f${ph}-done`) ? ' (gate tagged)' : ''} | ${d}/${ps.length} | \`${bar(d, ps.length)}\` | ${list(ps.filter((p) => p.status !== 'done'))} |\n`;
}

md += `\n## All plans\n\n| Plan | Agent | Phase | Status | Still waiting for | Note |\n|---|---|---|---|---|---|\n`;
for (const p of plans) {
	md += `| ${p.id} ${p.title} | A${p.agent} | F${p.phase} | ${LABEL[p.status]} | ${p.status === 'wait' ? missing(p).join(', ') : ''} | ${cell(p.note).replace(/^—$/, '')} |\n`;
}
if (prep.length)
	md += `\nWhile-waiting handovers (roadmap §4.4): ${prep.map((t) => `\`${t}\``).join(', ')}\n`;

const count = (s: Status) => plans.filter((p) => p.status === s).length;
const summary = `roadmap-progress: ${done}/${plans.length} done, ${count('wip')} in progress, ${count('ready')} waiting for merge, ${count('bounce')} bounced, ${count('open')} can start (${source})`;

if (print) {
	for (const a of [1, 2, 3] as const) {
		const mine = plans.filter((p) => p.agent === a);
		const wip = mine
			.filter((p) => p.status === 'wip' || p.status === 'ready')
			.map((p) => `${p.id} ${LABEL[p.status]}`);
		console.log(
			`${AGENT[a]}: ${mine.filter((p) => p.status === 'done').length}/${mine.length} done · ${wip.join(', ') || 'nothing open'} · now: ${state[a].now || '—'} · waiting: ${state[a].waiting || '—'}`
		);
	}
	console.log(summary);
	process.exit(0);
}
await Bun.write(OUT_MD, md);

// ---- roadmap-graph.html -----------------------------------------------------
const html = await Bun.file(OUT_HTML).text();
const data = {
	generated: stamp,
	source,
	status: Object.fromEntries(plans.map((p) => [p.id, p.status])),
	agents: Object.fromEntries(
		([1, 2, 3] as const).map((a) => [
			a,
			{ now: state[a].now, waiting: state[a].waiting, updated: state[a].updated }
		])
	),
	gates
};
const block = `// PROGRESS:BEGIN (written by tools/roadmap-progress.ts)\nconst PROGRESS = ${JSON.stringify(data)};\n// PROGRESS:END`;
if (!/\/\/ PROGRESS:BEGIN[\s\S]*?\/\/ PROGRESS:END/.test(html)) {
	throw new Error('roadmap-progress: PROGRESS block not found in roadmap-graph.html');
}
await Bun.write(OUT_HTML, html.replace(/\/\/ PROGRESS:BEGIN[\s\S]*?\/\/ PROGRESS:END/, block));
console.log(summary);
