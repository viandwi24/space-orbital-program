/**
 * The stock tech tree's pacing (plan 105, ADR 0154 point 6): each tier's cost against the science
 * the flights that open it can yield, from the science model (first results and subject caps).
 */
import { describe, expect, test } from 'bun:test';
import { bodyScience, loadPlugins, nextValue, subjectCap } from '@orbital/sdk';
import Stock from '../src/index.ts';

const { registries } = loadPlugins([Stock]);
const experiments = registries.experiments.list();
const mult = (body: string) => bodyScience(registries.bodies.get(body)!).multiplier;

/** Science of the first result of every experiment in these situations at `body`, and the subjects' caps. */
function yieldOf(body: string, situations: readonly string[], only?: readonly string[]) {
	let first = 0;
	let cap = 0;
	for (const e of experiments) {
		if (only && !only.includes(e.id)) continue;
		// a station's experiments yield over days from other bodies' ground (plan 284), apart from the ascent
		if (e.station) continue;
		for (const s of situations) {
			if (!e.situations.includes(s)) continue;
			const c = subjectCap(e, mult(body));
			first += nextValue(e, mult(body), { count: 0, produced: 0, cap: c });
			cap += c;
		}
	}
	return { first, cap };
}

const ascent = ['stock.landed', 'stock.flying-low', 'stock.flying-high', 'stock.space-low'];
// what Basics measures (player-journey audit Q6): the thermometer alone
const starter = ['stock.temperature'];
const tierCost = (t: number) =>
	registries.techNodes
		.list()
		.filter((n) => n.tier === t)
		.reduce((s, n) => s + n.cost, 0);
const upTo = (t: number) => [1, 2, 3, 4].filter((x) => x <= t).reduce((s, x) => s + tierCost(x), 0);

describe('stock tech tree pacing', () => {
	const home = yieldOf('stock.home', ascent, starter);
	const homeAll = yieldOf('stock.home', ascent);
	const cinderFlyby = yieldOf('stock.cinder', ['stock.space-low', 'stock.space-high']);
	const cinderLanded = yieldOf('stock.cinder', ['stock.landed']);

	test('tier 1 costs no more than one first ascent with the starter instruments', () => {
		console.log(
			`first ascent ${home.first}, Home caps ${homeAll.cap}, Cinder flyby caps ${cinderFlyby.cap}, Cinder landed caps ${cinderLanded.cap}`
		);
		expect(tierCost(1)).toBeLessThanOrEqual(home.first);
	});

	test('tiers 1 and 2 need between one and two ascents', () => {
		// the second ascent carries what tier 1 bought (pressure, goo, materials, the air sample)
		// beside the thermometer's repeat, at half its first value (player-journey audit Q6)
		const tier1 = ['stock.pressure', 'stock.goo', 'stock.materials', 'stock.atmosphere-sample'];
		const second = yieldOf('stock.home', ascent, tier1).first + home.first / 2;
		expect(upTo(2)).toBeGreaterThan(home.first);
		expect(upTo(2)).toBeLessThanOrEqual(home.first + second);
	});

	test('tier 3 cannot be bought with Home alone, and can with a Cinder flyby', () => {
		expect(upTo(3)).toBeGreaterThan(homeAll.cap);
		expect(upTo(3)).toBeLessThanOrEqual(homeAll.cap + cinderFlyby.cap);
	});

	test('tier 4 needs a landing on Cinder', () => {
		expect(upTo(4)).toBeGreaterThan(homeAll.cap + cinderFlyby.cap);
		expect(upTo(4)).toBeLessThanOrEqual(homeAll.cap + cinderFlyby.cap + cinderLanded.cap);
	});

	test('every part but the suit and the flag is in a node; Basics hold the reference rockets', () => {
		const tiered = new Set(registries.techNodes.list().flatMap((n) => n.unlocks ?? []));
		const untiered = registries.parts
			.list()
			.filter((p) => !tiered.has(p.id))
			.map((p) => p.id);
		// a thrown-off fairing panel is debris, never built (plan 219)
		expect(untiered.sort()).toEqual([
			'stock.eva-suit',
			'stock.fairing-panel',
			'stock.flag',
			'stock.petal-panel-0',
			'stock.petal-panel-1',
			'stock.petal-panel-2',
			'stock.petal-panel-3'
		]);
		const basics = registries.techNodes.get('stock.basics')!;
		for (const p of ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv', 'stock.decoupler'])
			expect(basics.unlocks).toContain(p);
	});
});
