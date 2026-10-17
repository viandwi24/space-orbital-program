/**
 * Scenarios, the mission packs of plan 100 (ADR 0151 point 4): a world's starting preset and rules,
 * the vessels its first flight begins with, and the missions that start with it.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { Vec3 } from './math.ts';
import type { VesselDesign, VesselPlacement } from './protocol.ts';
import { vesselDesignSchema } from './protocol-schemas.ts';

/** Newton's gravitational constant, m³ kg⁻¹ s⁻². */
const G = 6.6743e-11;

export type ScenarioVessel =
	| { design: VesselDesign; name?: string; orbit: { body: string; altitude: number } }
	| { design: VesselDesign; name?: string; site: true };

export interface ScenarioDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	title: string;
	description: string;
	/** The preset the world is made with, and rule values over it. */
	preset: string;
	rules?: Record<string, boolean | number | string>;
	vessels: ScenarioVessel[];
	/** Missions started with the world. */
	missions?: string[];
}

const id = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');

export const scenarioDefinitionSchema = z.object({
	id,
	title: z.string().min(1),
	description: z.string().min(1),
	preset: id,
	rules: z.record(id, z.union([z.boolean(), z.number().finite(), z.string()])).optional(),
	vessels: z
		.array(
			z.union([
				z.object({
					design: vesselDesignSchema,
					name: z.string().min(1).optional(),
					orbit: z.object({ body: id, altitude: z.number().finite().positive() })
				}),
				z.object({
					design: vesselDesignSchema,
					name: z.string().min(1).optional(),
					site: z.literal(true)
				})
			])
		)
		.min(1),
	missions: z.array(id).optional()
});

/**
 * Where a scenario vessel starts: an orbit is circular and equatorial at `altitude` over the body's
 * radius (position on +X, velocity along -Z, as the sim's orbit tests do); `site` is the site's pad.
 */
export function scenarioPlacement(
	vessel: ScenarioVessel,
	bodies: { get(id: string): { radius: number; mass: number } | undefined },
	site = 'legacy'
): VesselPlacement {
	if ('site' in vessel) return { kind: 'site', site };
	const body = bodies.get(vessel.orbit.body);
	if (!body) throw new Error(`scenario vessel: unknown body ${vessel.orbit.body}`);
	const r = body.radius + vessel.orbit.altitude;
	const position: Vec3 = { x: r, y: 0, z: 0 };
	const velocity: Vec3 = { x: 0, y: 0, z: -Math.sqrt((G * body.mass) / r) };
	return { kind: 'state', body: vessel.orbit.body as never, position, velocity };
}
