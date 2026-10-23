/**
 * Every stock blueprint in every system (plan 380, ADR 0317): stock (easy), Sol rescaled (medium) and
 * Sol 1:1 (real). Each launches headlessly on the Guidance Computer's ascent to the system's low orbit,
 * with the design the blueprint has for that system (a real-size Kronos V for Sol 1:1). What is left
 * for a moon trip is laid over the trip planner's legs, as the Hangar's trip line does. `EXPECTED`
 * marks the outcome per system: what a blueprint is designed for must reach its goal there; outside
 * its systems it may fall short, or be overkill.
 *
 * ORBITAL_FLIGHTS=<id,...> limits the run to some blueprints; ORBITAL_FLIGHT_REPORT=<file> writes the
 * table of outcomes.
 */
import {
	blueprintDesignFor,
	blueprintFits,
	GRAVITATIONAL_CONSTANT,
	LEGACY_SITE,
	legacyWorldInfo,
	loadPlugins,
	type BlueprintDefinition,
	type VesselDesign,
	type WorldInfo
} from '@orbital/core';
import Guidance from '@orbital/mod-guidance';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { pathfinder } from '../onboarding/lesson-vessels';
import { systemFacts, type SystemFacts } from '../worlds/system-facts';
import { destinationsOf } from './trip';
import { tripView } from './trip-view';
import { designStats } from './stats';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

type SystemKey = 'stock' | 'rescaled' | '1:1';
interface System {
	id: string;
	variant?: string;
	world?: WorldInfo;
	bodies: ReturnType<typeof bodiesOf>;
	facts: SystemFacts;
}
const bodiesOf = (id: string, variant?: string) =>
	loadPlugins([Stock, Sol], {
		system: { id, ...(variant ? { variant } : {}) }
	}).registries.bodies.list();
const solWorld = (variant: string): WorldInfo => ({
	...legacyWorldInfo(7),
	id: '3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f',
	systemId: 'sol',
	systemVersion: '0.1.0',
	variant,
	epoch: { day: 9_575, fraction: 0 },
	sites: [{ ...LEGACY_SITE, id: 'equator', name: 'Equator', body: 'sol.earth' }]
});
const SYSTEMS: Record<SystemKey, System> = {
	stock: { id: 'stock', bodies: bodiesOf('stock'), facts: systemFacts(bodiesOf('stock'))! },
	rescaled: {
		id: 'sol',
		variant: 'rescaled',
		world: solWorld('rescaled'),
		bodies: bodiesOf('sol', 'rescaled'),
		facts: systemFacts(bodiesOf('sol', 'rescaled'), 'sol.earth')!
	},
	'1:1': {
		id: 'sol',
		variant: '1:1',
		world: solWorld('1:1'),
		bodies: bodiesOf('sol', '1:1'),
		facts: systemFacts(bodiesOf('sol', '1:1'), 'sol.earth')!
	}
};

/**
 * - `goal`: it reached its goal (an orbit above the air; for a moon goal, with the Δv for the trip
 *   planner's legs on to the moon's orbit).
 * - `orbit`: it reached orbit, but is short of the rest of its goal.
 * - `short`: no orbit.
 * - `ground`: no rocket (a rover, a glider): it is not flown.
 */
type Outcome = 'goal' | 'orbit' | 'short' | 'ground';

/** The expected outcome per blueprint and system. */
const EXPECTED: Record<string, Record<SystemKey, Outcome>> = {
	// the learn rockets fly the first tech tiers' parts: stock only (plan 380, eras)
	'stock.two-stage': { stock: 'goal', rescaled: 'short', '1:1': 'short' },
	'stock.boosters': { stock: 'goal', rescaled: 'short', '1:1': 'short' },
	'stock.asparagus': { stock: 'goal', rescaled: 'short', '1:1': 'short' },
	'stock.moon-shot': { stock: 'goal', rescaled: 'orbit', '1:1': 'short' },
	'stock.glider': { stock: 'ground', rescaled: 'ground', '1:1': 'ground' },
	'stock.kronos-selene': { stock: 'goal', rescaled: 'goal', '1:1': 'goal' },
	// a Sol-scale Shuttle needs a bigger tank and boosters, and an ascent that holds the stack's
	// attitude after the boosters go: draft plan 385
	'stock.wayfarer-shuttle': { stock: 'goal', rescaled: 'short', '1:1': 'short' },
	'stock.horizon-station': { stock: 'goal', rescaled: 'goal', '1:1': 'goal' },
	'stock.moonwatch-orbiter': { stock: 'goal', rescaled: 'goal', '1:1': 'goal' },
	'stock.horizon-telescope': { stock: 'goal', rescaled: 'goal', '1:1': 'goal' },
	'stock.aurora-satellite': { stock: 'goal', rescaled: 'goal', '1:1': 'goal' },
	'stock.trailblazer-rover': { stock: 'ground', rescaled: 'ground', '1:1': 'ground' },
	// the orbit lessons' rocket: lessons fly in a stock world
	'lesson.pathfinder': { stock: 'goal', rescaled: 'goal', '1:1': 'short' }
};

interface Case {
	id: string;
	goal: BlueprintDefinition['goal'];
	crew: number;
	blueprint?: BlueprintDefinition;
	design(system: System): VesselDesign;
}
const CASES: Case[] = [
	...registries.blueprints
		.list()
		.filter((b) => b.id.startsWith('stock.'))
		.map((b): Case => ({
			id: b.id,
			goal: b.goal,
			crew: b.crew,
			blueprint: b,
			design: (s) => blueprintDesignFor(b, s.id, s.variant)
		})),
	{
		id: 'lesson.pathfinder',
		goal: 'orbit',
		crew: 1,
		design: () => pathfinder({ parts: registries.parts, modules: registries.modules })
	}
];

/** Δv left for the goal after the ascent's legs: the trip planner over the design's stages. */
function budgetCovers(c: Case, s: System, design: VesselDesign): boolean {
	if (c.goal !== 'moon') return true;
	const moon = s.facts.moon!;
	// the moon's orbit: the trip planner lays legs over the stages in series, so it cannot fly
	// Apollo's split (the lander down and up while the command ship waits in orbit)
	const kind = 'orbit';
	const dest = destinationsOf(s.bodies, s.facts.home).find(
		(d) => d.body === moon.id && d.kind === kind
	)!;
	const g = GRAVITATIONAL_CONSTANT * s.bodies.find((b) => b.id === s.facts.home)!.mass;
	const home = s.bodies.find((b) => b.id === s.facts.home)!;
	const stats = designStats(design, content, 'sea-level', g / home.radius ** 2);
	return tripView(dest, stats.report, stats.partCount).state === 'covered';
}

/** Fly the ascent: the periapsis altitude reached, m (-Infinity without an orbit), and how it ended. */
async function fly(c: Case, s: System, design: VesselDesign): Promise<{ pe: number; end: string }> {
	const sim = await createSim({
		plugins: [Stock, Sol, Guidance],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1,
		seed: 7,
		...(s.world ? { world: s.world } : {})
	});
	try {
		const r = sim.dispatch({ type: 'load-vessel', design });
		if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
		const id = r.vessel;
		const at = () => sim.snapshot().vessels.find((v) => v.id === id);
		const engaged = sim.dispatch({
			type: 'autopilot-engage',
			vessel: id,
			autopilot: 'guidance.ascent',
			params: { altitude: s.facts.lowOrbit }
		});
		if (!engaged.ok) return { pe: -Infinity, end: `not engaged: ${engaged.reason}` };
		let ended = false;
		let end = 'timeout';
		const off = sim.events.on('autopilot:ended', (e) => {
			if (e.vessel === id) {
				ended = true;
				end = `${e.outcome}: ${e.reason}`;
			}
		});
		const damage: string[] = [];
		const offDamage = sim.events.on('part:damaged', (e) => {
			if (e.vessel === id && damage.length < 3)
				damage.push(
					`${e.definition} ${e.outcome} by ${e.cause}${'temperature' in e && e.temperature ? ` at ${Math.round(e.temperature as number)} K` : ''} t=${Math.round(sim.time)}`
				);
		});
		for (let t = 0; !ended && t < 3_000; t += 0.1) {
			sim.step(0.1);
			const v = at();
			if (!v) break;
			const phase = v.autopilot?.phase;
			// ORBITAL_TRACE=<file>: the flight every 20 s
			if (process.env.ORBITAL_TRACE && Math.round(t * 10) % 200 === 0)
				appendFileSync(
					process.env.ORBITAL_TRACE,
					`${c.id} t=${t.toFixed(0)} ${phase} ${v.autopilot?.status} stage=${v.nextStage} parts=${v.parts.length} ${JSON.stringify(v.autopilot?.readouts)} v=${Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z).toFixed(0)}\n`
				);
		}
		off();
		offDamage();
		if (damage.length > 0) end += ` [${damage.join('; ')}]`;
		const v = at();
		if (!v) return { pe: -Infinity, end: `${end} (vessel gone)` };
		const home = sim.registries.bodies.get(s.facts.home)!;
		const mu = GRAVITATIONAL_CONSTANT * home.mass;
		const rr = Math.hypot(v.position.x, v.position.y, v.position.z);
		const speed = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z);
		const energy = speed ** 2 / 2 - mu / rr;
		if (energy >= 0) return { pe: Infinity, end };
		const a = -mu / (2 * energy);
		const p = v.position;
		const w = v.velocity;
		const h = Math.hypot(p.y * w.z - p.z * w.y, p.z * w.x - p.x * w.z, p.x * w.y - p.y * w.x);
		const e = Math.sqrt(Math.max(0, 1 - (h * h) / (mu * a)));
		return { pe: a * (1 - e) - home.radius, end };
	} finally {
		sim.dispose();
	}
}

const only = (process.env.ORBITAL_FLIGHTS ?? '').split(',').filter(Boolean);

describe('stock blueprints in every system (plan 380)', () => {
	it('every stock blueprint has an expected outcome per system, and lists the systems it is for', () => {
		for (const c of CASES) expect(Object.keys(EXPECTED), c.id).toContain(c.id);
		// what a blueprint is designed for, it reaches: its goal is expected there
		for (const c of CASES.filter((x) => x.blueprint))
			for (const [key, s] of Object.entries(SYSTEMS) as [SystemKey, System][])
				if (blueprintFits(c.blueprint!, s.id, s.variant))
					expect(['goal', 'ground'], `${c.id} in ${key}`).toContain(EXPECTED[c.id]![key]);
	});

	for (const c of CASES.filter((x) => only.length === 0 || only.includes(x.id)))
		for (const key of Object.keys(SYSTEMS) as SystemKey[]) {
			const expected = EXPECTED[c.id]?.[key];
			it(`${c.id} in ${key}: ${expected}`, async () => {
				const s = SYSTEMS[key];
				const design = c.design(s);
				let outcome: Outcome = 'ground';
				let note = '';
				if (expected !== 'ground') {
					const { pe, end } = await fly(c, s, design);
					const air = s.facts.atmosphereTop ?? 0;
					const orbit = pe > air;
					outcome = !orbit ? 'short' : budgetCovers(c, s, design) ? 'goal' : 'orbit';
					note = `${pe === Infinity ? 'escape' : pe === -Infinity ? 'no vessel' : `periapsis ${(pe / 1000).toFixed(0)} km`}; ${end}`;
				}
				console.log(`[blueprint-systems] ${c.id} | ${key} | ${outcome} | ${note}`);
				// ORBITAL_FLIGHT_REPORT=<file> keeps the table (the log shows failures only)
				if (process.env.ORBITAL_FLIGHT_REPORT)
					appendFileSync(
						process.env.ORBITAL_FLIGHT_REPORT,
						`${c.id} | ${key} | ${outcome} | ${note}\n`
					);
				expect(outcome).toBe(expected);
			}, 900_000);
		}
});
