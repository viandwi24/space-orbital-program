/** Owner, 2026-10-21: Kronos V reached the Hangar's roof. Every blueprint fits with room to spare. */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { HANGAR } from '@orbital/renderer';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { allBlueprints } from './blueprints';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
/** The platform's top, m (the vessel stands on it). */
const PLATFORM_TOP = 0.3;
/** Headroom asked for: the building at least 1.3 times the tallest blueprint. */
const ROOM = 1.3;

/** Height and the widest reach from the vessel's axis, m (a box shape counted by its half-diagonal). */
function extent(design: ReturnType<(typeof cards)[number]['build']>) {
	const r = resolveVesselDesign(design, content.parts);
	if (!r.ok) throw new Error(r.errors.join('; '));
	let lo = Infinity;
	let hi = -Infinity;
	let reach = 0;
	for (const p of r.parts) {
		const s = p.definition.shape;
		const half =
			s?.kind === 'cylinder' ? s.height / 2 : s?.kind === 'box' ? Math.max(...s.size) / 2 : 0.5;
		const radius =
			s?.kind === 'cylinder' ? s.radius : s?.kind === 'box' ? Math.hypot(...s.size) / 2 : 0.5;
		lo = Math.min(lo, p.position.y - half);
		hi = Math.max(hi, p.position.y + half);
		reach = Math.max(reach, Math.hypot(p.position.x, p.position.z) + radius);
	}
	return { height: hi - lo, reach };
}

const cards = allBlueprints();

describe('the Hangar fits every blueprint (owner, 2026-10-21)', () => {
	for (const card of cards) {
		it(`${card.title}`, () => {
			const { height, reach } = extent(card.build(content));
			expect(PLATFORM_TOP + height * ROOM, `${height.toFixed(1)} m tall`).toBeLessThan(
				HANGAR.height
			);
			expect(reach * ROOM, `${reach.toFixed(1)} m wide`).toBeLessThan(HANGAR.half);
		});
	}
});
