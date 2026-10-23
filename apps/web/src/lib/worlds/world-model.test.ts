import { epochFromUtc, loadPlugins, type Calendar } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	catchUpCommand,
	catchUpOffer,
	createWorldInfo,
	duplicateWorldInfo,
	isCustom,
	isIdentityRule,
	presetRules,
	ruleGroups,
	usesMissingMod,
	type CreateWorldInput,
	type RuleCatalog
} from './world-model';

const { registries } = loadPlugins([Stock]);
const catalog: RuleCatalog = { rules: registries.rules.list(), presets: registries.presets.list() };
const FICTIONAL: Calendar = {
	kind: 'fictional',
	home: 'stock.home',
	dayLength: 21_600,
	yearLength: null
};
const UTC: Calendar = { kind: 'gregorian-utc' };
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

const input = (patch: Partial<CreateWorldInput> = {}): CreateWorldInput => ({
	id: 'w-1',
	seed: 42,
	preset: 'stock.career',
	rules: {},
	start: { kind: 'day-one' },
	gravityModel: 'patched',
	systemId: 'stock',
	systemVersion: '1.0.0',
	variant: 'default',
	...patch
});

describe('Create World from the registries', () => {
	it('the Career preset gives a world whose rules equal the preset values', () => {
		const r = createWorldInfo(input(), catalog, FICTIONAL, NOW);
		if (!r.ok) throw new Error(r.reason);
		expect(r.world.rules).toEqual(presetRules(catalog, 'stock.career'));
		expect(r.world.rules['stock.economy']).toBe(true);
		expect(r.world.rules['stock.crew-death']).toBe('permanent');
		expect(r.world.preset).toBe('stock.career');
		expect(r.world.epoch).toEqual({ day: 0, fraction: 0 });
		expect(isCustom(catalog, 'stock.career', r.world.rules)).toBe(false);
	});

	it('changing one rule marks the preset Custom', () => {
		const rules = { ...presetRules(catalog, 'stock.career'), 'stock.crew-death': 'off' };
		expect(isCustom(catalog, 'stock.career', rules)).toBe(true);
		const r = createWorldInfo(
			input({ rules: { 'stock.crew-death': 'off' } }),
			catalog,
			FICTIONAL,
			NOW
		);
		expect(r.ok && r.world.rules['stock.crew-death']).toBe('off');
	});

	it('groups every rule by category and marks the identity rules', () => {
		const groups = ruleGroups(catalog);
		expect(groups.map((g) => g.category)).toEqual([
			'economy',
			'science',
			'crew',
			'comms',
			'launch',
			'agency',
			'world'
		]);
		expect(groups.flatMap((g) => g.rules).length).toBe(catalog.rules.length);
		const agency = catalog.rules.find((r) => r.id === 'stock.agency-type')!;
		expect(isIdentityRule(agency)).toBe(true);
	});

	it('an n-body world is accepted since plan 125; an unknown model is refused', () => {
		const r = createWorldInfo(input({ gravityModel: 'n-body' }), catalog, FICTIONAL, NOW);
		expect(r.ok && r.world.gravityModel).toBe('n-body');
		expect(createWorldInfo(input({ gravityModel: 'orbits' }), catalog, FICTIONAL, NOW).ok).toBe(
			false
		);
		expect(createWorldInfo(input({ gravityModel: 'teleport' }), catalog, FICTIONAL, NOW).ok).toBe(
			false
		);
	});

	it('a forged rule value and an unknown preset are refused', () => {
		expect(
			createWorldInfo(input({ rules: { 'stock.crew-return-days': 900 } }), catalog, FICTIONAL, NOW)
				.ok
		).toBe(true);
		expect(createWorldInfo(input({ preset: 'x.none' }), catalog, FICTIONAL, NOW)).toEqual({
			ok: false,
			reason: 'unknown preset "x.none"'
		});
	});

	it('a fictional calendar starts on day 1; a Gregorian one takes today, a fixed date or J2000', () => {
		expect(createWorldInfo(input({ start: { kind: 'today' } }), catalog, FICTIONAL, NOW).ok).toBe(
			false
		);
		const today = createWorldInfo(input({ start: { kind: 'today' } }), catalog, UTC, NOW);
		expect(today.ok && today.world.epoch).toEqual(
			epochFromUtc({ year: 2026, month: 10, day: 17, hour: 12, minute: 0, second: 0 })
		);
		const fixed = createWorldInfo(
			input({ start: { kind: 'fixed', year: 1969, month: 7, day: 16 } }),
			catalog,
			UTC,
			NOW
		);
		expect(fixed.ok && fixed.world.epoch.day).toBeLessThan(0);
	});

	it('duplicate: new id and seed, same rules and start, no changelog', () => {
		const r = createWorldInfo(input(), catalog, FICTIONAL, NOW);
		if (!r.ok) throw new Error(r.reason);
		const world = {
			...r.world,
			changelog: [{ time: 1, rule: 'stock.economy', from: true, to: false }]
		};
		const copy = duplicateWorldInfo(world, 'w-2', 7);
		expect(copy).toEqual({ ...world, id: 'w-2', seed: 7, changelog: [] });
		expect(copy.rules).not.toBe(world.rules);
	});
});

describe('catch-up offer', () => {
	const epoch = epochFromUtc({ year: 2026, month: 9, day: 7, hour: 12, minute: 0, second: 0 });
	const onRails = { t: 0, vessels: [{ name: 'Relay', mode: 'on-rails' as const }] };

	it('a world 40 days behind the clock is offered the real date; accepting warps to its sim time', () => {
		const offer = catchUpOffer(epoch, UTC, onRails, NOW);
		if (offer.kind !== 'offer') throw new Error(offer.kind);
		expect(offer.behindSeconds).toBeCloseTo(40 * 86_400, 3);
		expect(offer.time).toBeCloseTo(40 * 86_400, 3);
		expect(offer.date).toBe('2026-10-17 12:00:00.000 UTC');
		expect(catchUpCommand(offer)).toEqual({ type: 'warp-to', time: offer.time, factor: 1_000_000 });
	});

	it('with a vessel in flight the offer says why it is unavailable', () => {
		const flying = { t: 0, vessels: [{ name: 'Lander', mode: 'flight' as const }] };
		expect(catchUpOffer(epoch, UTC, flying, NOW)).toEqual({
			kind: 'unavailable',
			behindSeconds: expect.closeTo(40 * 86_400, 3),
			reason: '"Lander" is in flight; time warp needs every vessel on rails.'
		});
	});

	it('nothing when caught up, never backwards, never on a fictional calendar', () => {
		expect(catchUpOffer(epoch, UTC, { ...onRails, t: 40 * 86_400 }, NOW).kind).toBe('none');
		expect(catchUpOffer(epoch, UTC, { ...onRails, t: 50 * 86_400 }, NOW).kind).toBe('none');
		expect(catchUpOffer({ day: 0, fraction: 0 }, FICTIONAL, onRails, NOW).kind).toBe('none');
	});
});

describe('missing mods (system audit)', () => {
	it('a retired built-in mod (Trajectories, now in Guidance) is not reported missing', () => {
		const loaded = new Map([
			['stock', '1.0.0'],
			['guidance', '1.0.0']
		]);
		expect(usesMissingMod([{ id: 'stock' }, { id: 'trajectories' }], loaded)).toBe(false);
		expect(usesMissingMod([{ id: 'stock' }, { id: 'someone.rovers' }], loaded)).toBe(true);
	});
});
