/** The planner in the stats strip (plan 034): each state renders from the view model, server-side. */
import { designCost, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { designStats } from '../editor/stats';
import { stabilityOf } from '../editor/stability';
import { destinationsOf } from '../editor/trip';
import { tripView } from '../editor/trip-view';
import StatsStrip from './StatsStrip.svelte';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const destinations = destinationsOf(registries.bodies.list());
const design = referenceTwoStage();
const stats = designStats(design, content, 'vacuum', 9.81);
const stability = stabilityOf(design, content);

function html(id: string, withDesign: boolean): string {
	const s = withDesign
		? stats
		: designStats({ ...design, parts: [], stages: [] }, content, 'vacuum', 9.81);
	const dest = destinations.find((d) => d.id === id)!;
	return render(StatsStrip, {
		props: {
			stats: s,
			trip: tripView(dest, s.report, s.partCount),
			destinations,
			destinationId: id,
			onpick: () => {},
			stability
		}
	}).body;
}

describe('StatsStrip trip planner', () => {
	it('lists every destination in the select and marks the chosen one', () => {
		const out = html('stock.cinder:landing', true);
		for (const d of destinations) expect(out).toContain(d.label);
		expect(out).toMatch(
			/<option[^>]*value="stock\.cinder:landing"[^>]*selected|selected[^>]*value="stock\.cinder:landing"/
		);
	});

	it('empty design: says to add parts, no stage is named', () => {
		const out = html('low-orbit', false);
		expect(out).toContain('data-state="empty"');
		expect(out).toContain('Add parts to see which stages cover the trip');
	});

	it('the stock two-stage reaches low orbit and names its stages on the legs', () => {
		const out = html('low-orbit', true);
		expect(out).toContain('data-state="covered"');
		expect(out).toContain('Enough for the trip');
		expect(out).toContain('Stage 1 (sea level)');
	});

	it('the same design is short of the moon landing, and says by how much', () => {
		const out = html('stock.cinder:landing', true);
		expect(out).toContain('data-state="short"');
		expect(out).toMatch(/Short by about/);
		expect(out).toContain('short by');
	});

	it('parts without a stage that gives delta-v: says what is missing', () => {
		const pod = { ...stats, report: null };
		const out = render(StatsStrip, {
			props: {
				stats: pod,
				trip: tripView(destinations[0]!, pod.report, pod.partCount),
				destinations,
				destinationId: 'low-orbit',
				onpick: () => {},
				stability
			}
		}).body;
		expect(out).toContain('data-state="no-propulsion"');
		expect(out).toContain('No stage gives delta-v yet');
	});

	it('one row per leg', () => {
		const dest = destinations.find((d) => d.id === 'stock.cinder:return')!;
		const out = html(dest.id, true);
		expect(out.match(/<li class="/g)?.length).toBe(dest.legs.length);
		expect(out).toContain(`Legs (${dest.legs.length})`);
	});
});

describe('StatsStrip cost (plan 095)', () => {
	const props = (cost: ReturnType<typeof designCost>) => ({
		stats,
		trip: tripView(destinations[0]!, stats.report, stats.partCount),
		destinations,
		destinationId: destinations[0]!.id,
		onpick: () => {},
		stability,
		cost
	});

	it('shows the launch cost of the reference two-stage', () => {
		const cost = designCost(design, content);
		expect(cost.total).toBeCloseTo(26_066.4, 6);
		const out = render(StatsStrip, { props: props(cost) }).body;
		expect(out).toContain('Cost');
		expect(out).toContain('26,066');
		expect(out).not.toContain('no cost set');
	});

	it('says "no cost set" for a part a mod registered without a cost', () => {
		const base = registries.parts.get('stock.tank-small')!;
		const parts = {
			get: (id: string) =>
				id === 'acme.tank' ? { ...base, id: 'acme.tank', cost: undefined } : registries.parts.get(id)
		};
		const modded = {
			...design,
			parts: design.parts.map((p, i) => (i === 2 ? { ...p, part: 'acme.tank' as never } : p))
		};
		const cost = designCost(modded, { ...content, parts });
		expect(cost.uncosted).toEqual(['acme.tank']);
		const out = render(StatsStrip, { props: props(cost) }).body;
		expect(out).toContain('no cost set');
		expect(out).toContain('No cost set for acme.tank');
	});
});
