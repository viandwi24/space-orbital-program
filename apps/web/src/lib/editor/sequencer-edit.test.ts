import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	addKey,
	addTrack,
	applySequencer,
	durationOf,
	jointsOf,
	keyPosition,
	removeKey,
	removeTrack,
	sequencerOf,
	setKey,
	setMode
} from './sequencer-edit';
import { attachNew, attachTargets, createEditor, singlePart } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;

function build(parts: string[]) {
	let s = createEditor(emptyDesign(), content);
	for (const part of parts) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), lookup);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}

describe('sequencer editing (plan 282)', () => {
	const s = build(['stock.command-pod', 'stock.sequencer', 'stock.hinge-s', 'stock.piston-s']);
	const seq = s.design.parts.find((p) => p.part === 'stock.sequencer')!.index;

	it('lists the joints a track can drive, with their travel', () => {
		const joints = jointsOf(s.design, lookup);
		expect(joints.map((j) => j.kind)).toEqual(['hinge', 'piston']);
		expect(joints[0]).toMatchObject({ min: -90, max: 90, unit: '°' });
		expect(joints[1]).toMatchObject({ min: 0, max: 0.6, unit: 'm' });
		const rotor = build(['stock.command-pod', 'stock.rotor-s']);
		expect(jointsOf(rotor.design, lookup)).toEqual([]);
	});

	it('edits tracks and keyframes and saves them in the design, one undo step each', () => {
		const joints = jointsOf(s.design, lookup);
		let c = sequencerOf(s.design, lookup, seq)!;
		expect(c).toEqual({ tracks: [], mode: 'once' });
		c = addTrack(c, joints[0]!);
		c = addKey(c, 0);
		expect(c.tracks[0]!.keys).toHaveLength(3);
		expect(durationOf(c.tracks)).toBe(3);
		c = setKey(c, 0, 1, { t: 4, value: 500 }, joints[0]!);
		expect(c.tracks[0]!.keys[1]).toEqual({ t: 4, value: 90 });
		c = setMode(c, 'loop');
		const next = applySequencer(s, content, seq, c);
		expect(sequencerOf(next.design, lookup, seq)).toEqual(c);
		// the saved design resolves and round-trips
		expect(
			JSON.parse(JSON.stringify(next.design)).parts.find((p: { index: number }) => p.index === seq)
				.settings['stock.sequencer'].mode
		).toBe('loop');
		expect(removeKey(c, 0, 0).tracks[0]!.keys).toHaveLength(2);
		expect(removeTrack(c, 0).tracks).toEqual([]);
	});

	it('keeps a track at least one keyframe and limits the counts', () => {
		const joints = jointsOf(s.design, lookup);
		let c = addTrack({ tracks: [], mode: 'once' }, joints[0]!);
		c = removeKey(removeKey(c, 0, 0), 0, 0);
		expect(c.tracks[0]!.keys).toHaveLength(1);
		for (let i = 0; i < 12; i++) c = addTrack(c, joints[1]!);
		expect(c.tracks).toHaveLength(8);
		expect(keyPosition(1, 4)).toBe(0.25);
		expect(keyPosition(9, 4)).toBe(1);
		expect(keyPosition(1, 0)).toBe(0);
	});

	it('a part without the module has no sequencer', () => {
		expect(sequencerOf(s.design, lookup, s.design.parts[0]!.index)).toBeNull();
	});
});
