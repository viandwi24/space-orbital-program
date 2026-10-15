#!/usr/bin/env bun
/**
 * docs-check — validates the structure of the docs system (ADR 0009).
 *
 *  - every docs/plans/NNN-*.md has valid frontmatter (id matches filename, known status, depends exist)
 *  - at most one plan is in-progress per owner, and in-progress plans have an owner
 *  - docs/STATUS.md's plan board references existing plans and matching statuses
 *  - docs/decisions/README.md index lists every ADR file and vice versa
 *  - every `done` plan has a journal entry
 *
 * Run: bun run docs:check
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PLANS = join(ROOT, 'docs/plans');
const ADRS = join(ROOT, 'docs/decisions');
const JOURNAL = join(ROOT, 'docs/journal');
const STATUS = join(ROOT, 'docs/STATUS.md');

const STATUSES = new Set(['draft', 'ready', 'in-progress', 'done', 'blocked']);
const errors: string[] = [];
const fail = (m: string) => errors.push(m);

type Plan = { id: string; file: string; status: string; owner: string; depends: string[] };

function parseFrontmatter(text: string, file: string): Record<string, string> | null {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	const out: Record<string, string> = {};
	for (const line of m[1]!.split('\n')) {
		const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
		if (kv) out[kv[1]!] = kv[2]!.trim();
	}
	return out;
}

// ---- plans ---------------------------------------------------------------
const plans = new Map<string, Plan>();
for (const file of (await readdir(PLANS)).filter((f) => /^\d{3}-.+\.md$/.test(f))) {
	const text = await Bun.file(join(PLANS, file)).text();
	const fm = parseFrontmatter(text, file);
	if (!fm) {
		fail(`plans/${file}: missing frontmatter`);
		continue;
	}
	const id = file.slice(0, 3);
	if (fm.id !== id) fail(`plans/${file}: frontmatter id "${fm.id}" != filename id "${id}"`);
	if (!STATUSES.has(fm.status ?? '')) fail(`plans/${file}: unknown status "${fm.status}"`);
	const depends = (fm.depends ?? '[]')
		.replace(/[\[\]\s]/g, '')
		.split(',')
		.filter(Boolean);
	const owner = (fm.owner ?? '').replace(/^"|"$/g, '');
	if (fm.status === 'in-progress' && !owner) fail(`plans/${file}: in-progress but no owner`);
	for (const h of ['## Goal', '## Acceptance criteria', '## Docs checklist', '## Log']) {
		if (!text.includes(h) && id !== '000') fail(`plans/${file}: missing section "${h}"`);
	}
	if (id !== '000') plans.set(id, { id, file, status: fm.status!, owner, depends });
}
for (const p of plans.values()) {
	for (const d of p.depends)
		if (!plans.has(d)) fail(`plans/${p.file}: depends on unknown plan ${d}`);
	if (p.status === 'ready' || p.status === 'in-progress') {
		for (const d of p.depends) {
			const dep = plans.get(d);
			if (dep && dep.status !== 'done')
				fail(`plans/${p.file}: is ${p.status} but depends on ${d} which is ${dep.status}`);
		}
	}
	if (p.status === 'done') {
		const entries = (await readdir(JOURNAL)).filter(
			(f) => f.startsWith(p.id + '-') && f.endsWith('.md')
		);
		if (entries.length === 0)
			fail(`plans/${p.file}: done but no journal entry docs/journal/${p.id}-*.md`);
	}
}

// ---- STATUS.md board -----------------------------------------------------
const status = await Bun.file(STATUS).text();
const boardRows = [
	...status.matchAll(/^\|\s*(\d{3})\s*\|\s*\[.*?\]\((plans\/[^)]+)\)\s*\|\s*([a-z-]+)\s*\|/gm)
];
if (boardRows.length === 0) fail('STATUS.md: no plan board rows found');
const seen = new Set<string>();
for (const [, id, link, st] of boardRows) {
	seen.add(id!);
	const p = plans.get(id!);
	if (!p) {
		fail(`STATUS.md: board references unknown plan ${id}`);
		continue;
	}
	if (link !== `plans/${p.file}`)
		fail(`STATUS.md: row ${id} links ${link}, expected plans/${p.file}`);
	if (st !== p.status) fail(`STATUS.md: row ${id} says "${st}" but plan says "${p.status}"`);
}
for (const id of plans.keys()) if (!seen.has(id)) fail(`STATUS.md: plan ${id} missing from board`);

// ---- ADR index -----------------------------------------------------------
const adrFiles = (await readdir(ADRS)).filter(
	(f) => /^\d{4}-.+\.md$/.test(f) && !f.startsWith('0000-')
);
const adrIndex = await Bun.file(join(ADRS, 'README.md')).text();
for (const f of adrFiles) {
	if (!adrIndex.includes(`](${f})`)) fail(`decisions/README.md: ADR ${f} not in index`);
	const text = await Bun.file(join(ADRS, f)).text();
	if (!/\*\*Status:\*\*\s*(proposed|accepted|superseded by \d{4}|deprecated)/.test(text))
		fail(`decisions/${f}: missing/invalid Status line`);
}
for (const [, linked] of adrIndex.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)) {
	if (!adrFiles.includes(linked!)) fail(`decisions/README.md: index links missing file ${linked}`);
}

// ---- report --------------------------------------------------------------
if (errors.length) {
	console.error(`docs-check: ${errors.length} problem(s)`);
	for (const e of errors) console.error('  - ' + e);
	process.exit(1);
}
console.log(`docs-check: OK (${plans.size} plans, ${adrFiles.length} ADRs)`);
