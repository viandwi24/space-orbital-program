/** Plan 029 / ADR 0042: centre of mass against centre of pressure. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import { checkDesign } from './checks';
import {
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	radialTarget,
	singlePart,
	type EditorState
} from './state';
import { stabilityOf } from './stability';
import { designStats } from './stats';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const editorContent = { parts: content.parts, modules: content.modules };

const twoStage = (): EditorState => createEditor(referenceTwoStage(), editorContent);

/** The two-stage vessel with four fins at height `y` on the lower tank (index 5; the tank spans y +- 0.6). */
function finned(y: number, parent = 5): EditorState {
	const s = twoStage();
	const t = radialTarget(
		s.design,
		singlePart('stock.fin', s.nextIndex),
		content.parts,
		parent,
		0,
		y
	)!;
	return attachNew(s, editorContent, 'stock.fin', t, 4);
}

describe('stability read-out', () => {
	it('an empty design has no state', () => {
		expect(stabilityOf(emptyDesign(), content).state).toBe('none');
	});

	it('the reference two-stage is unfinned; mass and pressure heights are the weighted means', () => {
		const s = stabilityOf(referenceTwoStage(), content);
		expect(s.state).toBe('unfinned');
		expect(s.fins).toBe(0);
		// Hand computation, heights from the part table (pod 0, wheel -0.7, tank -1.9, engine -3.5,
		// decoupler -4.2, tank -5.3, engine -6.9 m):
		// - dry centre of mass: (100 * -0.7 + 250 * -1.9 + 1250 * -3.5 + 50 * -4.2 + 250 * -5.3 + 1250 * -6.9) / 3990 = -3.7794 m,
		//   and the pod's 840 kg sit 0.12 m low in it (plan 265): -0.12 * 840 / 3990 = -0.0253 m more, -3.8047 m
		// - pressure: every part has the same drag coefficient, the cross-flow area is 2 r h, so
		//   the mean of y weighted by the heights (1, 0.4, 2, 1.2, 0.2, 2, 1.2) = -28 / 8 = -3.5 m
		expect(s.comEmpty!).toBeCloseTo(-3.8047, 3);
		expect(s.cop!).toBeCloseTo(-3.5, 6);
		// Full tanks (fuel adds mass to the two tanks): -3.6555 m, and -3.6634 m with the pod's low mass.
		expect(s.com!).toBeCloseTo(-3.6634, 3);
		expect(s.calibre).toBeCloseTo(1.25, 2);
	});

	it('four fins low on the lower tank put the pressure behind the mass: stable', () => {
		const s = stabilityOf(finned(-0.4).design, content);
		expect(s.fins).toBe(4);
		expect(s.cop!).toBeLessThan(s.com!);
		expect(s.margin!).toBeGreaterThan(0);
		expect(['stable', 'marginal']).toContain(s.state);
	});

	it('the same fins on the upper tank, high up, are unstable', () => {
		const s = stabilityOf(finned(0.4, 2).design, content);
		expect(s.fins).toBe(4);
		expect(s.state).toBe('unstable');
		expect(s.margin!).toBeLessThan(0);
	});

	it('fins move the pressure down: the lower they sit, the larger the margin', () => {
		const low = stabilityOf(finned(-0.5).design, content);
		const high = stabilityOf(finned(0.5).design, content);
		expect(low.cop!).toBeLessThan(high.cop!);
		expect(low.margin!).toBeGreaterThan(high.margin!);
	});

	it('check "unstable" warns for an unstable finned design only', () => {
		const stats = (d: EditorState) => designStats(d.design, content, 'sea-level', 9.81);
		const bad = finned(0.4, 2);
		const warn = checkDesign(bad, content, stats(bad), stabilityOf(bad.design, content));
		expect(warn.find((c) => c.id === 'unstable')?.severity).toBe('warning');
		const good = finned(-0.5);
		expect(
			checkDesign(good, content, stats(good), stabilityOf(good.design, content)).some(
				(c) => c.id === 'unstable'
			)
		).toBe(false);
		const bare = twoStage();
		expect(
			checkDesign(bare, content, stats(bare), stabilityOf(bare.design, content)).some(
				(c) => c.id === 'unstable'
			)
		).toBe(false);
	});
});
