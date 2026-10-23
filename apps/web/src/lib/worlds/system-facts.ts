/**
 * What a star system asks of a rocket (plan 380, ADR 0317), computed from its bodies with the trip
 * planner's ascent model (ADR 0083), never stated by hand: the top of the home atmosphere, the low
 * orbit and the Δv to it, and the Δv to the first moon's orbit, to a landing on it and back. Create
 * World, the Hangar and the lessons read these, so a mod's system needs no numbers of its own.
 */
import type { BodyDefinition } from '@orbital/core';
import { destinationsOf, lowOrbitAltitude } from '../editor/trip';

export interface SystemFacts {
	home: string;
	/** "Home", "Earth". */
	homeName: string;
	/** Top of the home atmosphere, m; null when airless. */
	atmosphereTop: number | null;
	/** Altitude of the home body's low orbit, m. */
	lowOrbit: number;
	/** Δv from the pad to that orbit, m/s (gravity and drag losses included). */
	dvToOrbit: number;
	/**
	 * How hard the system is, from the Δv to orbit (ADR 0317: the system sets the difficulty):
	 * under 4.5 km/s easy (stock), under 7.5 km/s medium (Sol rescaled), else realistic (Sol 1:1).
	 */
	difficulty: 'Easy · learning' | 'Medium' | 'Realistic';
	/** The home body's first moon, when it has one the reference ascent can reach. */
	moon: {
		id: string;
		name: string;
		dvToOrbit: number;
		dvToLanding: number;
		dvAndBack: number;
	} | null;
}

const cache = new Map<string, SystemFacts | null>();

export function systemFacts(
	bodies: readonly BodyDefinition[],
	homeId?: string
): SystemFacts | null {
	const key = `${homeId ?? ''}|${bodies.map((b) => `${b.id}:${b.mass}:${b.radius}:${b.atmosphere?.height ?? 0}`).join(',')}`;
	if (cache.has(key)) return cache.get(key)!;
	const all = destinationsOf(bodies, homeId);
	const low = all.find((d) => d.kind === 'low-orbit');
	const home = low && bodies.find((b) => b.id === low.body);
	let facts: SystemFacts | null = null;
	if (low && home) {
		const orbit = all.find((d) => d.kind === 'orbit');
		const of = (kind: string) => all.find((d) => d.kind === kind && d.body === orbit?.body)?.total;
		facts = {
			home: home.id,
			homeName: nameOf(home.id),
			atmosphereTop: home.atmosphere?.height ?? null,
			lowOrbit: lowOrbitAltitude(home),
			dvToOrbit: low.total,
			difficulty:
				low.total < 4_500 ? 'Easy · learning' : low.total < 7_500 ? 'Medium' : 'Realistic',
			moon: orbit
				? {
						id: orbit.body,
						name: nameOf(orbit.body),
						dvToOrbit: orbit.total,
						dvToLanding: of('landing') ?? orbit.total,
						dvAndBack: of('return') ?? orbit.total
					}
				: null
		};
	}
	cache.set(key, facts);
	return facts;
}

/** "sol.earth" -> "Earth", "stock.home" -> "Home". */
function nameOf(id: string): string {
	const last = id.split('.').pop() ?? id;
	return last.charAt(0).toUpperCase() + last.slice(1);
}

/** `Medium · Δv to orbit ≈ 5.2 km/s · Moon in 4.9 days`: the computed Δv, the pack's transfer time. */
export function factsLine(f: SystemFacts, moonTransfer?: number): string {
	return (
		`${f.difficulty} · Δv to orbit ≈ ${(f.dvToOrbit / 1000).toFixed(1)} km/s` +
		(moonTransfer === undefined ? '' : ` · Moon in ${(moonTransfer / 86_400).toFixed(1)} days`)
	);
}
