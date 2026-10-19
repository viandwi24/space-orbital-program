/**
 * Stock contract templates (plan 099, ADR 0186 point 8): an altitude record and orbit (tier 1),
 * a moon flyby and a moon landing (tier 2), a landing and return and a planet flyby on the next
 * transfer window (tier 3); since plan 231 (ADR 0231 point 6) a rescue and a satellite (tier 1),
 * a station and a docking (tier 2), each after the milestone that makes it possible. Each draws its parameters from the generator's stream and estimates
 * its mission's Δv, so the offer can show its expected value.
 */
import {
	defineContractTemplate,
	estimatedLaunchCost,
	hohmannTransfer,
	partId,
	type VesselDesign,
	type ContractBlueprint,
	type ContractBodyView,
	type ContractTemplateContext,
	type RewardEntry
} from '@orbital/sdk';

/** Gravity and drag loss on the way up, m/s (an estimate; ADR 0083 has the real model). */
const ASCENT_LOSS = 1_150;
/** Expected value over cost by tier: advance + reward = this × the estimated cost. */
const VALUE = [1.2, 1.25, 1.3] as const;
const ADVANCE_SHARE = 0.2;
const PENALTY_SHARE = 0.5;

const circular = (b: ContractBodyView, altitude: number): number =>
	Math.sqrt(b.mu / (b.radius + altitude));
const round = (x: number, step: number): number => Math.round(x / step) * step;
const km = (m: number): string => `${Math.round(m / 1000).toLocaleString('en-US')} km`;

/** Δv from the ground to a low orbit of `b` at `altitude`, m/s. */
const ascent = (b: ContractBodyView, altitude: number, loss = ASCENT_LOSS): number =>
	circular(b, altitude) + loss;

/** The money of a blueprint from its estimated Δv and tier, with ±10 % from the stream. */
function money(
	ctx: ContractTemplateContext,
	deltaV: number,
	tier: 1 | 2 | 3
): Pick<ContractBlueprint, 'advance' | 'reward' | 'penalty'> {
	const cost = estimatedLaunchCost(deltaV);
	const total = cost * VALUE[tier - 1]! * (0.9 + 0.2 * ctx.random());
	const reward = round(total / (1 + ADVANCE_SHARE), 500);
	const funds = (amount: number): RewardEntry => ({ currency: 'funds', amount });
	return {
		advance: [funds(round(reward * ADVANCE_SHARE, 500))],
		reward: [funds(reward), { currency: 'reputation', amount: 5 * tier }],
		penalty: [
			funds(-round(reward * PENALTY_SHARE, 500)),
			{ currency: 'reputation', amount: -3 * tier }
		]
	};
}

const days = (ctx: ContractTemplateContext, n: number): number => n * ctx.dayLength;
const moonsOf = (ctx: ContractTemplateContext) =>
	ctx.bodies.filter((b) => b.parent === ctx.home.id);
const pick = <T>(ctx: ContractTemplateContext, list: readonly T[]): T | undefined =>
	list.length === 0 ? undefined : list[Math.floor(ctx.random() * list.length)];

/** The low orbit a template aims at above the home body: 12 % of its radius (about 72 km at home). */
const lowOrbit = (b: ContractBodyView): number => 0.12 * b.radius;

/** Δv of a Hohmann departure from a low home orbit to a moon's orbit, m/s. */
function toMoon(home: ContractBodyView, moon: ContractBodyView): number {
	const r1 = home.radius + lowOrbit(home);
	return hohmannTransfer(home.mu, r1, moon.a).dv1;
}

export const ContractAltitude = defineContractTemplate({
	id: 'stock.contract-altitude',
	label: 'Altitude record',
	tier: 1,
	weight: 2,
	maxOffers: 2,
	generate: (ctx) => {
		const h = round(ctx.home.radius * (0.03 + 0.09 * ctx.random()), 5_000);
		const g = ctx.home.mu / ctx.home.radius ** 2;
		const deltaV = Math.sqrt(2 * g * h) * 1.4;
		return {
			key: `altitude:${ctx.home.id}:${h}`,
			title: `Reach ${km(h)} above ${ctx.home.label}`,
			brief: `Sounding-rocket work: any vessel that climbs to ${km(h)} does it, and it may come straight back down.`,
			objectives: { objective: 'stock.reach-altitude', params: { min: h } },
			...money(ctx, deltaV, 1),
			deadline: days(ctx, 30),
			deltaV
		};
	}
});

export const ContractOrbit = defineContractTemplate({
	id: 'stock.contract-orbit',
	label: 'Orbit',
	tier: 1,
	weight: 2,
	generate: (ctx) => {
		const low = lowOrbit(ctx.home);
		const peri = round(low * (1 + 0.5 * ctx.random()), 5_000);
		const apo = round(peri + ctx.home.radius * (0.15 + 0.35 * ctx.random()), 5_000);
		const deltaV = ascent(ctx.home, peri);
		return {
			key: `orbit:${ctx.home.id}:${peri}:${apo}`,
			title: `Orbit ${ctx.home.label} between ${km(peri)} and ${km(apo)}`,
			brief: `Put any vessel on an orbit with its periapsis at ${km(peri)} or higher and its apoapsis at ${km(apo)} or lower.`,
			objectives: {
				objective: 'stock.reach-orbit',
				params: { minPeriapsis: peri, maxApoapsis: apo }
			},
			...money(ctx, deltaV, 1),
			deadline: days(ctx, 45),
			deltaV
		};
	}
});

export const ContractMoonFlyby = defineContractTemplate({
	id: 'stock.contract-moon-flyby',
	label: 'Moon flyby',
	tier: 2,
	generate: (ctx) => {
		const moon = pick(ctx, moonsOf(ctx));
		if (!moon) return null;
		const deltaV = ascent(ctx.home, lowOrbit(ctx.home)) + toMoon(ctx.home, moon);
		return {
			key: `flyby:${moon.id}`,
			title: `Fly by ${moon.label}`,
			brief: `Send any vessel into ${moon.label}'s sphere of influence and out again.`,
			objectives: { objective: 'stock.flyby', params: { body: moon.id } },
			...money(ctx, deltaV, 2),
			deadline: days(ctx, 60),
			deltaV
		};
	}
});

export const ContractMoonLanding = defineContractTemplate({
	id: 'stock.contract-moon-landing',
	label: 'Moon landing',
	tier: 2,
	generate: (ctx) => {
		const moon = pick(ctx, moonsOf(ctx));
		if (!moon) return null;
		const low = circular(moon, 0.1 * moon.radius);
		const deltaV = ascent(ctx.home, lowOrbit(ctx.home)) + toMoon(ctx.home, moon) + 2.2 * low;
		return {
			key: `landing:${moon.id}`,
			title: `Land on ${moon.label}`,
			brief: `Put any vessel down on ${moon.label}, crewed or not.`,
			objectives: { objective: 'stock.land', params: { body: moon.id } },
			...money(ctx, deltaV, 2),
			deadline: days(ctx, 90),
			deltaV
		};
	}
});

export const ContractMoonReturn = defineContractTemplate({
	id: 'stock.contract-moon-return',
	label: 'Moon landing and return',
	tier: 3,
	generate: (ctx) => {
		const moon = pick(ctx, moonsOf(ctx));
		if (!moon) return null;
		const low = circular(moon, 0.1 * moon.radius);
		const out = toMoon(ctx.home, moon);
		const deltaV = ascent(ctx.home, lowOrbit(ctx.home)) + 2 * out + 4.4 * low;
		return {
			key: `return:${moon.id}`,
			title: `Land on ${moon.label} and come home`,
			brief: `Land any vessel on ${moon.label}, then bring it back down on ${ctx.home.label}.`,
			objectives: {
				sequence: [
					{ objective: 'stock.land', params: { body: moon.id } },
					{ objective: 'stock.return-home', params: {} }
				]
			},
			...money(ctx, deltaV, 3),
			deadline: days(ctx, 150),
			deltaV
		};
	}
});

/** A flyby of a sibling planet, due one transfer and a margin after its next window. */
export const ContractPlanetFlyby = defineContractTemplate({
	id: 'stock.contract-planet-flyby',
	label: 'Planet flyby',
	tier: 3,
	generate: (ctx) => {
		const siblings = ctx.bodies.filter(
			(b) => b.parent !== null && b.parent === ctx.home.parent && b.id !== ctx.home.id
		);
		const planet = pick(ctx, siblings);
		if (!planet) return null;
		const window = ctx.window(planet.id);
		if (!window) return null;
		const parent = ctx.bodies.find((b) => b.id === ctx.home.parent)!;
		const transfer = hohmannTransfer(parent.mu, ctx.home.a, planet.a);
		// leaving a low orbit onto the transfer's excess speed (patched conics)
		const r = ctx.home.radius + lowOrbit(ctx.home);
		const escape =
			Math.sqrt(transfer.dv1 ** 2 + (2 * ctx.home.mu) / r) - circular(ctx.home, lowOrbit(ctx.home));
		const deltaV = ascent(ctx.home, lowOrbit(ctx.home)) + escape;
		const wait = Math.max(0, window.departure - ctx.time);
		const deadline = wait + 1.3 * window.travel + days(ctx, 30);
		return {
			key: `planet-flyby:${planet.id}`,
			title: `Fly by ${planet.label}`,
			brief: `The next window to ${planet.label} opens in ${Math.ceil(wait / ctx.dayLength)} days. Send any vessel through its sphere of influence.`,
			objectives: { objective: 'stock.flyby', params: { body: planet.id } },
			...money(ctx, deltaV, 3),
			deadline,
			deltaV
		};
	}
});

// ---- plan 231 (ADR 0231 point 6): rescue, satellite, station, docking ----

const ORBIT_HOME = (ctx: ContractTemplateContext): string => `orbit:${ctx.home.id}`;
const has = (ctx: ContractTemplateContext, milestone: string): boolean =>
	ctx.milestones.includes(milestone);
const deg = (rad: number): string => `${Math.round((rad * 180) / Math.PI)}°`;

/** The stranded pod of a rescue: a command pod alone, on rails. */
export const strandedPod = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Stranded pod',
	parts: [{ index: 0, part: partId('stock.command-pod'), parent: null }],
	stages: []
});

export const ContractRescue = defineContractTemplate({
	id: 'stock.contract-rescue',
	label: 'Rescue',
	tier: 1,
	generate: (ctx) => {
		if (!has(ctx, ORBIT_HOME(ctx))) return null;
		const altitude = round(ctx.home.radius * (0.13 + 0.07 * ctx.random()), 5_000);
		// up, a rendezvous, and down again
		const deltaV = ascent(ctx.home, altitude) + 400;
		return {
			key: `rescue:${ctx.home.id}:${altitude}`,
			title: `Rescue a crew member from ${km(altitude)} above ${ctx.home.label}`,
			brief: `A pod is stranded in a circular orbit at ${km(altitude)}, with someone inside. Reach it, bring them aboard (an EVA across, or dock and transfer), and recover them at home.`,
			objectives: { objective: 'stock.rescue', params: {} },
			...money(ctx, deltaV, 1),
			deadline: days(ctx, 60),
			deltaV,
			spawn: { design: strandedPod(), body: ctx.home.id, altitude, member: true }
		};
	}
});

export const ContractSatellite = defineContractTemplate({
	id: 'stock.contract-satellite',
	label: 'Satellite',
	tier: 1,
	generate: (ctx) => {
		if (!has(ctx, ORBIT_HOME(ctx))) return null;
		const peri = round(ctx.home.radius * (0.15 + 0.35 * ctx.random()), 10_000);
		const apo = round(peri + ctx.home.radius * 0.3 * ctx.random(), 10_000);
		const inclination = (Math.round(6 * ctx.random()) * 5 * Math.PI) / 180;
		const v = circular(ctx.home, peri);
		const deltaV = ascent(ctx.home, peri) + 2 * v * Math.sin(inclination / 2);
		return {
			key: `satellite:${ctx.home.id}:${peri}:${apo}:${Math.round((inclination * 180) / Math.PI)}`,
			title: `A satellite at ${km(peri)} by ${km(apo)}, ${deg(inclination)} inclined`,
			brief: `Put a vessel with an antenna and a source of power (a solar panel or a generator) on an orbit of ${ctx.home.label}: periapsis ${km(peri)} and apoapsis ${km(apo)} (each within 10 %), inclination ${deg(inclination)} (within 2°).`,
			objectives: {
				objective: 'stock.satellite',
				params: { periapsis: peri, apoapsis: apo, inclination }
			},
			...money(ctx, deltaV, 1),
			deadline: days(ctx, 60),
			deltaV
		};
	}
});

export const ContractStation = defineContractTemplate({
	id: 'stock.contract-station',
	label: 'Space station',
	tier: 2,
	generate: (ctx) => {
		if (!has(ctx, `dock:${ctx.home.id}`)) return null;
		const seats = 2 + Math.floor(3 * ctx.random());
		const minPeriapsis = round(lowOrbit(ctx.home) * 1.5, 5_000);
		const deltaV = ascent(ctx.home, minPeriapsis) * 1.3;
		return {
			key: `station:${ctx.home.id}:${seats}`,
			title: `A station for ${seats} around ${ctx.home.label}`,
			brief: `Build a station in orbit of ${ctx.home.label} with its periapsis at ${km(minPeriapsis)} or higher: a docking port, at least ${seats} crew seats and a source of power. It may be assembled from several launches.`,
			objectives: { objective: 'stock.station', params: { minPeriapsis, seats } },
			...money(ctx, deltaV, 2),
			deadline: days(ctx, 120),
			deltaV
		};
	}
});

export const ContractDocking = defineContractTemplate({
	id: 'stock.contract-docking',
	label: 'Docking',
	tier: 2,
	generate: (ctx) => {
		if (!has(ctx, ORBIT_HOME(ctx))) return null;
		// two vessels up and one rendezvous
		const deltaV = 2 * ascent(ctx.home, lowOrbit(ctx.home)) + 300;
		return {
			key: `docking:${ctx.home.id}`,
			title: `Dock two vessels around ${ctx.home.label}`,
			brief: `Bring two vessels together in orbit of ${ctx.home.label} and join them with docking ports. A vessel launched before the contract may be one of them.`,
			objectives: { objective: 'stock.dock', params: {} },
			...money(ctx, deltaV, 2),
			deadline: days(ctx, 90),
			deltaV
		};
	}
});

export const STOCK_CONTRACT_TEMPLATES = [
	ContractAltitude,
	ContractOrbit,
	ContractMoonFlyby,
	ContractMoonLanding,
	ContractMoonReturn,
	ContractPlanetFlyby,
	ContractRescue,
	ContractSatellite,
	ContractStation,
	ContractDocking
] as const;
