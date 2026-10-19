import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { resolveVesselDesign } from '@orbital/core';
import { asparagusRocket, boosterRocket, glider, moonShot } from './examples';
import { starterRocket } from '../design';
import { designStats } from './stats';
import { destinationsOf } from './trip';
import { tripView } from './trip-view';
import { stabilityOf } from './stability';
import { createEditor } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

describe('booster rocket example', () => {
	it('has the 23 parts of the plan 026 vessel and is stable with its low fins', () => {
		const d = boosterRocket(content);
		expect(d.parts).toHaveLength(23);
		expect(d.parts.filter((p) => p.part === 'stock.fin')).toHaveLength(4);
		const s = stabilityOf(d, { ...content, resources: registries.resources });
		expect(s.fins).toBe(4);
		expect(s.state).not.toBe('unstable');
		expect(createEditor(d, content).design.stages.length).toBeGreaterThan(1);
	});
});

describe('asparagus rocket and glider examples (plan 041)', () => {
	const full = { ...content, resources: registries.resources };

	it('the asparagus rocket adds a fuel line and a strut per booster to the booster rocket', () => {
		const d = asparagusRocket(content);
		const base = boosterRocket(content);
		expect(d.formatVersion).toBe(3);
		expect(d.parts).toHaveLength(base.parts.length + 8);
		expect(d.parts.filter((p) => p.part === 'stock.fuel-line')).toHaveLength(4);
		expect(d.parts.filter((p) => p.part === 'stock.strut')).toHaveLength(4);
		expect(d.parts.filter((p) => p.link)).toHaveLength(8);
		expect(resolveVesselDesign(d, content.parts).ok).toBe(true);
		expect(stabilityOf(d, full).state).not.toBe('unstable');
		// The connectors are not staged: the stages are those of the booster rocket.
		expect(d.stages).toEqual(createEditor(d, content).design.stages);
	});

	it('the glider is a pod on a tank with two pairs of wings, the main pair at incidence', () => {
		const d = glider(content);
		expect(d.parts.map((p) => p.part)).toEqual([
			'stock.command-pod',
			'stock.tank-small',
			'stock.wing',
			'stock.wing',
			'stock.wing',
			'stock.wing'
		]);
		expect(d.parts.filter((p) => p.tilt).map((p) => p.tilt!.x)).toEqual([0.15, 0.15]);
		expect(resolveVesselDesign(d, content.parts).ok).toBe(true);
		const s = stabilityOf(d, full);
		expect(s.fins).toBe(4);
		expect(s.state).not.toBe('unstable');
	});
});

describe('moon shot example (plan 034)', () => {
	const full = { ...content, resources: registries.resources };

	it('is a valid design and the trip planner covers the landing and says what is left', () => {
		const d = moonShot();
		expect(resolveVesselDesign(d, content.parts).ok).toBe(true);
		const stats = designStats(d, full, 'vacuum', 9.81);
		const view = (id: string) =>
			tripView(
				destinationsOf(registries.bodies.list()).find((x) => x.id === id)!,
				stats.report,
				stats.partCount
			);
		expect(view('low-orbit').state).toBe('covered');
		const landing = view('stock.cinder:landing');
		expect(landing.state).toBe('covered');
		// the lander stage is the one that covers the transfer, the capture and the descent
		expect(
			landing.rows
				.filter((r) => r.id !== 'ascent')
				.every((r) => r.covers.every((c) => c.label === 'Stage 3'))
		).toBe(true);
	});
});

describe('every stock example with engines leaves the pad', () => {
	const full = { ...content, resources: registries.resources };
	const examples: Array<[string, () => import('@orbital/core').VesselDesign]> = [
		['two-stage', () => starterRocket()],
		['booster rocket', () => boosterRocket(content)],
		['asparagus rocket', () => asparagusRocket(content)],
		['moon shot', () => moonShot()]
	];
	it.each(examples)('%s: liftoff TWR at sea level is at least 1.2', (_name, make) => {
		const twr = designStats(make(), full, 'sea-level', 9.81).liftoffTwr;
		expect(twr).not.toBeNull();
		expect(twr!).toBeGreaterThanOrEqual(1.2);
	});

	it('the moon shot flies on half-thrust liquid boosters: TWR about 1.4, the same delta-v budget', () => {
		const stats = designStats(moonShot(), full, 'sea-level', 9.81);
		expect(stats.liftoffTwr!).toBeGreaterThan(1.3);
		expect(stats.liftoffTwr!).toBeLessThan(1.5);
		expect(designStats(moonShot(), full, 'vacuum', 9.81).totalDv).toBeGreaterThan(5_800);
	});
});
