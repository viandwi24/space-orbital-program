/**
 * The Regions layer of the map (plan 192, ADR 0180): which bodies get the tint, and the region
 * under the cursor, named the way the science dossier names it.
 */
import {
	regionAt,
	regionsOf,
	type BodyDefinition,
	type RegionWorld,
	type Vec3
} from '@orbital/core';
import { bodyLabel } from '../hud-model';

/** The bodies with science regions, each with the world part of its biome map (the home body's). */
export function regionLayer(
	bodies: readonly BodyDefinition[],
	terrain: RegionWorld | undefined,
	home: string | undefined
): Array<{ id: string; body: BodyDefinition; world?: RegionWorld }> {
	return bodies
		.filter((b) => b.regions !== undefined)
		.map((b) => ({ id: b.id, body: b, ...(b.id === home && terrain ? { world: terrain } : {}) }));
}

/** The label under the cursor: `<body> · <region>`, or null off a body or on one without regions. */
export function regionHoverLabel(
	bodies: readonly BodyDefinition[],
	hit: { body: string; direction: Vec3 } | null,
	terrain: RegionWorld | undefined,
	home: string | undefined
): string | null {
	if (!hit) return null;
	const body = bodies.find((b) => b.id === hit.body);
	if (!body?.regions) return null;
	const id = regionAt(body, hit.direction, hit.body === home ? (terrain ?? {}) : {});
	const label = regionsOf(body).find((r) => r.id === id)?.label ?? id;
	return `${bodyLabel(body.id)} · ${label}`;
}
