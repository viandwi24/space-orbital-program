/** Plan 219: fairing sections in the Hangar, each an undo step; a steep taper is refused. */
import { designCost, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	addFairingSection,
	addFairingSectionAt,
	fairingOf,
	removeFairingSection,
	setFairingClosed,
	setFairingInterstage,
	setFairingSection
} from './fairing';
import {
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	singlePart,
	undo,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

/** A tank with a 1.25 m fairing base on it (index 1). */
function base(): EditorState {
	let s = createEditor(emptyDesign(), content);
	s = attachNew(
		s,
		content,
		'stock.tank-small',
		attachTargets(s.design, singlePart('stock.tank-small', 0), content.parts)[0]!
	);
	const t = attachTargets(
		s.design,
		singlePart('stock.fairing-base', s.nextIndex),
		content.parts
	).find((x) => x.parent?.index === 0 && x.parent.parentNode === 'top')!;
	return attachNew(s, content, 'stock.fairing-base', t);
}

describe('fairing editing (plan 219)', () => {
	it('three clicks make three sections; undo removes the last', () => {
		let s = base();
		for (const section of [
			{ height: 0.8, radius: 0.8 },
			{ height: 1, radius: 0.8 },
			{ height: 0.5, radius: 0.6 }
		])
			s = addFairingSection(s, content, 1, section);
		expect(fairingOf(s.design, content.parts, 1)!.sections).toHaveLength(3);
		const back = undo(s);
		expect(fairingOf(back.design, content.parts, 1)!.sections).toHaveLength(2);
	});

	it('a 45 degree taper is refused with "Too steep"', () => {
		const s = addFairingSection(base(), content, 1, { height: 0.8, radius: 0.8 });
		expect(() => addFairingSection(s, content, 1, { height: 0.4, radius: 1.2 })).toThrow(
			'Too steep'
		);
		expect(() => setFairingSection(s, content, 1, 0, { radius: 1.6 })).toThrow();
	});

	it('Close caps the shell; the mass shows; removing the last section opens it', () => {
		let s = addFairingSection(base(), content, 1, { height: 1, radius: 0.8 });
		s = setFairingClosed(s, content, 1, true);
		const f = fairingOf(s.design, content.parts, 1)!;
		expect(f.closed).toBe(true);
		expect(f.mass).toBeGreaterThan(0);
		expect(f.problem).toBeNull();
		s = removeFairingSection(s, content, 1);
		expect(s.design.parts.find((p) => p.index === 1)!.settings).toBeUndefined();
		expect(() => setFairingClosed(s, content, 1, true)).toThrow('Add a section first');
	});
});

describe('interstage (plan 243, ADR 0238)', () => {
	const withShell = () =>
		addFairingSection(
			addFairingSection(base(), content, 1, { height: 1, radius: 0.7 }),
			content,
			1,
			{
				height: 0.5,
				radius: 0.7
			}
		);
	const stage = (s: EditorState): EditorState => {
		const held = singlePart('stock.tank-small', s.nextIndex);
		const t = attachTargets(s.design, held, content.parts).find(
			(x) => x.parent?.index === 1 && x.parent.parentNode === 'interstage'
		)!;
		return attachNew(s, content, 'stock.tank-small', t);
	};

	it('offers an interstage node only while it is on, and stays open at the top', () => {
		const s = withShell();
		const held = singlePart('stock.tank-small', s.nextIndex);
		const nodes = (st: EditorState) =>
			attachTargets(st.design, held, content.parts)
				.filter((x) => x.parent?.index === 1)
				.map((x) => x.parent!.parentNode);
		expect(nodes(s)).not.toContain('interstage');
		const on = setFairingInterstage(s, content, 1, true);
		expect(fairingOf(on.design, content.parts, 1)!.interstage).toBe(true);
		expect(nodes(on)).toContain('interstage');
		expect(() => setFairingClosed(on, content, 1, true)).toThrow('open at the top');
	});

	it('carries the next stage at the shell top, which follows the section heights', () => {
		let s = stage(setFairingInterstage(withShell(), content, 1, true));
		const y = (st: EditorState) => layoutOf(st.design, content.parts)!.get(2)!.position.y;
		const before = y(s);
		s = setFairingSection(s, content, 1, 1, { height: 1.5 });
		expect(y(s) - before).toBeCloseTo(1, 9);
	});

	it('is refused off while a stage hangs on it, and turned on without a section', () => {
		const s = stage(setFairingInterstage(withShell(), content, 1, true));
		expect(() => setFairingInterstage(s, content, 1, false)).toThrow('Move the stage');
		expect(() => setFairingInterstage(base(), content, 1, true)).toThrow('Add a section first');
	});

	it('the shell adds its cost to the part, and the view reports it (plan 243)', () => {
		const bare = base();
		const shell = addFairingSection(bare, content, 1, { height: 1, radius: 0.7 });
		const funds = (st: EditorState) => designCost(st.design, registries).total;
		const f = fairingOf(shell.design, content.parts, 1)!;
		expect(f.cost).toBeGreaterThan(0);
		expect(funds(shell) - funds(bare)).toBe(f.cost);
	});

	it('a section at the cursor height cuts the shell without changing its shape (plan 243)', () => {
		let s = addFairingSection(base(), content, 1, { height: 1, radius: 0.825 });
		// base rim 0.625 at y 0.1; the section ends at y 1.1 with radius 0.825
		s = addFairingSectionAt(s, content, 1, 0.6);
		const f = fairingOf(s.design, content.parts, 1)!;
		expect(f.sections).toHaveLength(2);
		expect(f.sections[0]!.height).toBeCloseTo(0.5, 9);
		expect(f.sections[0]!.radius).toBeCloseTo(0.725, 9);
		expect(f.sections[1]!.height).toBeCloseTo(0.5, 9);
		expect(f.sections[1]!.radius).toBeCloseTo(0.825, 9);
		expect(() => addFairingSectionAt(s, content, 1, 0.62)).toThrow('Too close');
		// above the top: a section up to the cursor at the last radius
		const up = addFairingSectionAt(s, content, 1, 1.9);
		expect(fairingOf(up.design, content.parts, 1)!.sections.at(-1)).toEqual({
			height: expect.closeTo(0.8, 9),
			radius: 0.825
		});
	});
});
