/**
 * How the map draws orbits and vessels (plan 258, ADR 0242), after KSP's map view: the active
 * vessel's orbit is bright white and the others' grey, the target's stands out, debris is dim; a
 * vessel is an icon of its type. Pure: the scene reads these rules, tests read them without a GPU.
 */
import type { VesselType } from '@orbital/core';

export type OrbitRole = 'active' | 'target' | 'other' | 'debris';

export interface OrbitStyle {
	/** 0xRRGGBB */
	colour: number;
	/** Line width in px. */
	width: number;
}

export const ORBIT_STYLES: Readonly<Record<OrbitRole, OrbitStyle>> = {
	active: { colour: 0xffffff, width: 3 },
	target: { colour: 0xffb454, width: 2.5 },
	other: { colour: 0x80858f, width: 1.5 },
	debris: { colour: 0x4f545c, width: 1 }
};

/** The orbit style of a vessel: the target wins over the active one, debris is always dim. */
export function orbitRole(
	vessel: { id: number; type?: VesselType },
	context: { active: number | null; target: number | null }
): OrbitRole {
	if (context.target !== null && vessel.id === context.target) return 'target';
	if (context.active !== null && vessel.id === context.active) return 'active';
	return vessel.type === 'debris' ? 'debris' : 'other';
}

/** The icon's tint: the orbit's colour, so a vessel and its line read as one. */
export const iconColour = (role: OrbitRole): number => ORBIT_STYLES[role].colour;

/**
 * One glyph per vessel type on the icons' 24 × 24 grid, stroked paths like the interface's own icon
 * set: a probe is a dish on a body, a ship a rocket, a station a ring with panels, and so on.
 */
export const VESSEL_ICON_PATHS: Readonly<Record<VesselType, string>> = {
	debris: 'M5 14l4-6 3 3 3-5 4 8-5 2-3-2Z',
	probe: 'M12 7v5M7 5l5 2 5-2M9 12h6v6H9ZM12 18v3',
	rover: 'M5 14h14l-1.5-4h-11ZM7.5 14v3M16.5 14v3M6 19a1.5 1.5 0 1 0 3 0M15 19a1.5 1.5 0 1 0 3 0',
	lander: 'M10 5h4l1 5h-6ZM9 10v4h6v-4M9 14l-3 6M15 14l3 6M5 20h4M15 20h4',
	ship: 'M12 3c3 3 4 7 4 11l2 3H6l2-3c0-4 1-8 4-11ZM10 17l-.5 4M14 17l.5 4',
	station: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8ZM3 10h5v4H3ZM16 10h5v4h-5ZM8 12h8',
	base: 'M4 20V10l8-6 8 6v10ZM10 20v-6h4v6',
	plane: 'M12 3v18M12 8L4 14v2l8-2 8 2v-2ZM9 20l3-1 3 1',
	relay:
		'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.5 7.5a6 6 0 0 0 0 9M16.5 7.5a6 6 0 0 1 0 9M5 5a9.5 9.5 0 0 0 0 14M19 5a9.5 9.5 0 0 1 0 14',
	eva: 'M12 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5ZM8 20v-6l-2-2M16 20v-6l2-2M8 12h8M10 20v-4M14 20v-4',
	flag: 'M7 21V4M7 5h11l-2.5 3.5L18 12H7'
};

/** The path of a type's icon; an unknown type draws the ship's. */
export const iconPath = (type: VesselType | undefined): string =>
	VESSEL_ICON_PATHS[type ?? 'ship'] ?? VESSEL_ICON_PATHS.ship;
