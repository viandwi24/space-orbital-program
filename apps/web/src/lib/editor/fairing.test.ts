/** Plan 219: fairing sections in the Hangar, each an undo step; a steep taper is refused. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	addFairingSection,
	fairingOf,
	removeFairingSection,
	setFairingClosed,
	setFairingSection
} from './fairing';
import {
	attachNew,
	attachTargets,
	createEditor,
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
