/** Naming and labels shown by the flight HUD (plan 021). Pure. */
import {
	describeModule,
	resolveVesselDesign,
	type ModuleDefinition,
	type PartLookup,
	type PartSnapshot,
	type VesselDesign
} from '@orbital/core';
import type { FlightPhase } from './telemetry';

export const DEFAULT_DESIGN_NAME = 'Untitled vessel';

/** FNV-1a over the design's parts and stages, 32 bit. */
let hashedParts: unknown = null;
let hashedStages: unknown = null;
let hashed = 0;
function fingerprint(design: VesselDesign): number {
	// the HUD asks every update: the same design objects hash once (plan 409)
	if (design.parts === hashedParts && design.stages === hashedStages) return hashed;
	const text = JSON.stringify([design.parts, design.stages]);
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	hashedParts = design.parts;
	hashedStages = design.stages;
	hashed = h >>> 0;
	return hashed;
}

/**
 * What the HUD calls the vessel: the design's name, or for a blank or default name a stable
 * callsign derived from the design (`OV-3A9F`), so two different unnamed designs read differently.
 */
export function displayVesselName(design: Pick<VesselDesign, 'name' | 'parts' | 'stages'>): string {
	const name = design.name.trim();
	if (name !== '' && name.toLowerCase() !== DEFAULT_DESIGN_NAME.toLowerCase()) return name;
	return `OV-${fingerprint(design as VesselDesign)
		.toString(16)
		.toUpperCase()
		.padStart(8, '0')
		.slice(0, 4)}`;
}

/** `stock.home` -> `Home`. */
export function bodyLabel(id: string): string {
	const name = id.slice(id.lastIndexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
}

export function situationLabel(
	phase: FlightPhase | null,
	escape: boolean,
	body: string,
	prelaunch = false,
	splashed = false
): string {
	if (prelaunch) return 'On the pad, ready to launch';
	switch (phase) {
		case 'landed':
			if (splashed) return `Splashed down on ${body}`;
			return `Landed on ${body}`;
		case 'flight':
			return `Flying over ${body}`;
		case 'suborbital':
			return `Suborbital over ${body}`;
		case 'orbit':
			return escape ? `Escaping ${body}` : `Orbiting ${body}`;
		default:
			return 'Starting up';
	}
}

/**
 * Height of the vessel's root part origin above the lowest point of its parts, m, for an upright
 * vessel (the sim stands it on the ground that way). The snapshot's altitude is the root origin's,
 * so subtracting this reads 0 m on the pad. 0 when the design does not resolve or has no shapes.
 */
export function groundClearance(design: VesselDesign, parts: PartLookup): number {
	const resolved = resolveVesselDesign(design, parts);
	if (!resolved.ok) return 0;
	let lowest = 0;
	for (const p of resolved.parts) {
		const shape = p.definition.shape;
		const half = !shape ? 0.5 : shape.kind === 'cylinder' ? shape.height / 2 : shape.size[1] / 2;
		lowest = Math.min(lowest, p.position.y - half);
	}
	return -lowest;
}

/** The registries `vesselThrottle` reads engines through. */
export interface ThrottleContent {
	parts: PartLookup;
	modules: { get(id: string): ModuleDefinition | undefined };
}

/**
 * The throttle the vessel is actually at, 0..1. The snapshot has no control state, but every engine
 * module copies the vessel throttle into its state each flight step and snapshots it, so scripts,
 * the autopilot and the keyboard all show up. The engine is found by its descriptor
 * (`ModuleInfo.engine.throttle`, ADR 0033), not by module id, so a mod's engine counts too (plan 023).
 * Without such an engine the page's own setting is returned.
 */
export function vesselThrottle(
	parts: readonly Pick<PartSnapshot, 'definition' | 'modules'>[],
	fallback: number,
	content: ThrottleContent
): number {
	let found = false;
	let max = 0;
	for (const p of parts) {
		const def = content.parts.get(p.definition);
		for (const [moduleId, raw] of def?.modules ?? []) {
			const view = p.modules[moduleId];
			if (view === undefined) continue;
			const mod = content.modules.get(moduleId);
			if (!mod?.describe) continue;
			let throttle: number | undefined;
			try {
				throttle = describeModule(mod, raw, view)?.engine?.throttle;
			} catch {
				// A mod whose descriptor throws or returns bad data must not take the HUD down.
				continue;
			}
			if (throttle === undefined) continue;
			found = true;
			max = Math.max(max, throttle);
		}
	}
	return found ? Math.min(1, Math.max(0, max)) : fallback;
}
