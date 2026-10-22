import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import { boosterRocket } from './examples';
import { reroot } from './reroot';
import { attachNew, attachTargets, createEditor, layoutOf, singlePart, type EditorState } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;

function stack(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of ['stock.command-pod', 'stock.tank-small', 'stock.tank-small']) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), lookup);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}

/** Every part's position relative to part `ref`. */
const relative = (d: EditorState['design'], ref: number) => {
	const at = layoutOf(d, lookup)!;
	const o = at.get(ref)!.position;
	return new Map(
		[...at].map(([i, l]) => [
			i,
			[l.position.x - o.x, l.position.y - o.y, l.position.z - o.z].map((v) => +v.toFixed(6))
		])
	);
};

describe('reroot (plan 348, ADR 0297)', () => {
	it('turns over every stack link between the new and the old root', () => {
		const s = stack();
		const [pod, tank1, tank2] = s.design.parts.map((p) => p.index) as [number, number, number];
		const r = reroot(s.design, tank2);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const parentOf = (i: number) => r.design.parts.find((p) => p.index === i)!.parent;
		expect(parentOf(tank2)).toBeNull();
		expect(parentOf(tank1)).toEqual({ index: tank2, parentNode: 'top', node: 'bottom' });
		expect(parentOf(pod)).toEqual({ index: tank1, parentNode: 'top', node: 'bottom' });
	});

	it('keeps every part where it was relative to the others', () => {
		const s = stack();
		const tank2 = s.design.parts[2]!.index;
		const r = reroot(s.design, tank2);
		if (!r.ok) throw new Error('refused');
		expect(relative(r.design, tank2)).toEqual(relative(s.design, tank2));
	});

	it('refuses a path through a radial or surface link, and the root itself', () => {
		const d = boosterRocket(content);
		const booster = d.parts.find((p) => p.part === 'stock.booster')!.index;
		expect(reroot(d, booster)).toEqual({ ok: false, reason: 'path' });
		const root = d.parts.find((p) => p.parent === null)!.index;
		expect(reroot(d, root)).toEqual({ ok: false, reason: 'already' });
	});
});
