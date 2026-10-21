/**
 * Seeing inside in the Hangar (plan 315, owner 2026-10-21): which parts enclose others (fairings,
 * bays, petals), what each one holds, and how the scene draws them. A shell turns see-through
 * while the pointer is on it or on what it holds; "Show payload" turns every shell see-through;
 * a part may be shown open (its doors, petals or fairing panels) in the editor only, never in the
 * saved design. Pure: the controller keeps the state, the scene reads the result.
 */
import {
	parseModuleConfig,
	withSettings,
	type PartDefinition,
	type PartLookup,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import type { ContentLookups } from '../delta-v';
import { layoutOf } from './state';

type Profile = ReadonlyArray<{ y: number; r: number }>;

/** The closed shell profile of a part in its own frame, or null when it encloses nothing. */
function shellProfile(
	part: VesselDesign['parts'][number],
	def: PartDefinition,
	content: Pick<ContentLookups, 'modules'>
): Profile | null {
	for (const [id, base] of def.modules ?? []) {
		const module = content.modules.get(id);
		if (!module?.shell) continue;
		const parsed = parseModuleConfig(module, withSettings(base, part.settings?.[id]));
		if (!parsed.ok) continue;
		const state = module.state?.(parsed.value);
		// a bay built open is still a bay: ask for the closed shell
		const closed =
			state && typeof state === 'object' && 'open' in state ? { ...state, open: false } : state;
		const profile = module.shell(parsed.value, closed);
		if (profile && profile.length >= 2) return profile;
	}
	return null;
}

/** `v` turned by the inverse of the unit quaternion `q`. */
function unturn(q: Quat, v: Vec3): Vec3 {
	const x = -q.x;
	const y = -q.y;
	const z = -q.z;
	const w = q.w;
	const cx = y * v.z - z * v.y;
	const cy = z * v.x - x * v.z;
	const cz = x * v.y - y * v.x;
	return {
		x: v.x + 2 * (w * cx + y * cz - z * cy),
		y: v.y + 2 * (w * cy + z * cx - x * cz),
		z: v.z + 2 * (w * cz + x * cy - y * cx)
	};
}

/** The profile's radius at height `y`, or -1 outside its span. */
function radiusAt(profile: Profile, y: number): number {
	for (let i = 0; i + 1 < profile.length; i++) {
		const a = profile[i]!;
		const b = profile[i + 1]!;
		if (y >= a.y && y <= b.y) {
			const t = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
			return a.r + (b.r - a.r) * t;
		}
	}
	return -1;
}

/**
 * Every enclosing part of the design and the parts inside it (by design index): a part is inside
 * when its origin lies within the shell's closed profile.
 */
export function shellsOf(
	design: VesselDesign,
	parts: PartLookup,
	content: Pick<ContentLookups, 'modules'>
): Map<number, number[]> {
	const out = new Map<number, number[]>();
	const layout = layoutOf(design, parts);
	if (!layout) return out;
	for (const p of design.parts) {
		const def = parts.get(p.part);
		const at = layout.get(p.index);
		if (!def || !at) continue;
		const profile = shellProfile(p, def, content);
		if (!profile) continue;
		const inside: number[] = [];
		for (const q of design.parts) {
			if (q.index === p.index) continue;
			const there = layout.get(q.index);
			if (!there) continue;
			const local = unturn(at.rotation, {
				x: there.position.x - at.position.x,
				y: there.position.y - at.position.y,
				z: there.position.z - at.position.z
			});
			const r = radiusAt(profile, local.y);
			if (r > 0 && Math.hypot(local.x, local.z) <= r) inside.push(q.index);
		}
		out.set(p.index, inside);
	}
	return out;
}

/**
 * The module states that draw `def` open (plan 315): its deploy flag on (bay doors, petals, a
 * telescope's door, legs, panels), or a fairing's shell hidden. Null when nothing opens.
 */
export function openModules(
	def: PartDefinition | undefined
): Record<string, Record<string, unknown>> | null {
	const v = def?.visual;
	if (v?.deploy) return { [v.deploy.module]: { [v.deploy.flag]: true } };
	if (v?.articulation?.mode === 'visible')
		return { [v.articulation.module]: { [v.articulation.field]: false } };
	return null;
}

const startCache = new Map<string, Record<string, Record<string, unknown>>>();

/**
 * How a part starts (plan 316): every module's snapshot from its config with the design's
 * settings (panels deployed, a lamp on, bay doors open), the same view the renderer reads in
 * flight, so the Hangar draws the part as it will launch.
 */
export function startModules(
	part: VesselDesign['parts'][number],
	def: PartDefinition | undefined,
	content: Pick<ContentLookups, 'modules'>
): Record<string, Record<string, unknown>> {
	if (!def) return {};
	const key = `${def.id}|${JSON.stringify(part.settings ?? {})}`;
	const known = startCache.get(key);
	if (known) return known;
	const out: Record<string, Record<string, unknown>> = {};
	for (const [id, base] of def.modules ?? []) {
		const module = content.modules.get(id);
		if (!module?.snapshot) continue;
		const parsed = parseModuleConfig(module, withSettings(base, part.settings?.[id]));
		if (!parsed.ok) continue;
		const view = module.snapshot(module.state?.(parsed.value) as never);
		if (view && typeof view === 'object') out[id] = view as Record<string, unknown>;
	}
	if (startCache.size > 2000) startCache.clear();
	startCache.set(key, out);
	return out;
}

export interface InsideState {
	/** The part under the pointer (design index), or null. */
	hover: number | null;
	/** Parts shown open in the editor. */
	open: ReadonlySet<number>;
	/** Every shell see-through. */
	showPayload: boolean;
}

/**
 * Which shells are drawn see-through now: all of them with "Show payload", else the one the
 * pointer is on or inside (the one holding the hovered part, so the ghost stays while the
 * pointer moves on to what it holds). An open shell needs no ghost.
 */
export function seeThroughOf(
	shells: ReadonlyMap<number, readonly number[]>,
	s: InsideState
): Set<number> {
	const out = new Set<number>();
	for (const [shell, inside] of shells) {
		if (s.open.has(shell)) continue;
		if (s.showPayload) out.add(shell);
		else if (s.hover !== null && (s.hover === shell || inside.includes(s.hover))) out.add(shell);
	}
	return out;
}
