/**
 * Procedural fairings (plan 219, ADR 0224): a base with a shell built from sections in the
 * Hangar (the design's per-part settings). Closed, the shell shields the parts inside from drag
 * and heat (`shell`); staged or jettisoned, it leaves as two panels (`spawnDebris`), each half
 * the shell's mass, pushed apart sideways so their momentum cancels.
 */
import { defineModule, z } from '@orbital/sdk';
import { partCost } from './costs.ts';

export const fairingSectionSchema = z.object({
	/** Height of the section, m. */
	height: z.number().positive().max(15),
	/** Radius at the section's top, m. */
	radius: z.number().positive().max(10)
});
export type FairingSection = z.output<typeof fairingSectionSchema>;

export const fairingConfigSchema = z.object({
	/** Base diameter, m (the node size it sits on). */
	size: z.number().positive(),
	/** The shell, bottom to top (per-part settings, ADR 0224). */
	sections: z.array(fairingSectionSchema).max(24).default([]),
	/** Capped with a nose: only a closed shell shields. */
	closed: z.boolean().default(false),
	/**
	 * An interstage (plan 243, ADR 0238): the shell is open at the top and carries the next stage on
	 * a node at its top; it shields what is inside like a closed one. Excludes `closed`.
	 */
	interstage: z.boolean().default(false),
	/** Shell mass per square metre, kg. */
	arealDensity: z.number().positive().default(4),
	/** Push on each panel at jettison, N·s, outward. */
	ejectionImpulse: z.number().nonnegative().default(300),
	/** The base's top face above its origin, m. */
	baseTop: z.number().default(0.1)
});
export type FairingConfig = z.output<typeof fairingConfigSchema>;

export interface FairingState {
	jettisoned: boolean;
	/** The shell as built, for the snapshot (the renderer draws it per part, plan 219). */
	sections: FairingSection[];
	closed: boolean;
	interstage?: boolean;
}

/** A panel's origin stands this far outside the shell's widest radius, m. */
export const PANEL_CLEARANCE = 0.15;

/** Limits of a section (plan 219, journal-noted starting values). */
export const FAIRING_LIMITS = {
	/** Steepest taper of one section from the vertical, rad. */
	maxTaper: (30 * Math.PI) / 180,
	minRadius: 0.3,
	/** Largest radius as a multiple of the base radius. */
	maxRadiusFactor: 2,
	maxHeight: 15
} as const;

/** Why `sections` cannot be built on a base of `size`, or null (the Hangar shows it). */
export function fairingProblem(size: number, sections: readonly FairingSection[]): string | null {
	let r = size / 2;
	let total = 0;
	for (const s of sections) {
		if (s.radius < FAIRING_LIMITS.minRadius) return 'Too narrow';
		if (s.radius > (size / 2) * FAIRING_LIMITS.maxRadiusFactor) return 'Too wide';
		if (Math.atan2(Math.abs(s.radius - r), s.height) > FAIRING_LIMITS.maxTaper + 1e-9) {
			return 'Too steep';
		}
		total += s.height;
		r = s.radius;
	}
	if (total > FAIRING_LIMITS.maxHeight + 1e-9) return 'Too tall';
	return null;
}

/**
 * The shell's profile in the base's frame, bottom to top: the base rim, each section's top and,
 * when closed, a nose to the axis as tall as the last radius.
 */
export function fairingProfile(config: FairingConfig): Array<{ y: number; r: number }> {
	if (config.sections.length === 0) return [];
	const out = [{ y: config.baseTop, r: config.size / 2 }];
	let y = config.baseTop;
	for (const s of config.sections) {
		y += s.height;
		out.push({ y, r: s.radius });
	}
	if (config.closed) out.push({ y: y + config.sections.at(-1)!.radius, r: 0 });
	return out;
}

/** Lateral area of the shell, m² (frusta between the profile points). */
export function fairingArea(config: FairingConfig): number {
	const p = fairingProfile(config);
	let area = 0;
	for (let i = 1; i < p.length; i++) {
		const a = p[i - 1]!;
		const b = p[i]!;
		area += Math.PI * (a.r + b.r) * Math.hypot(b.y - a.y, b.r - a.r);
	}
	return area;
}

export const fairingMass = (config: FairingConfig): number =>
	fairingArea(config) * config.arealDensity;

/** What the shell costs, funds: its mass at the structure rate (plan 243; the base costs its own). */
export const fairingCost = (config: FairingConfig): number =>
	partCost(fairingMass(config), 'structure');

/** Settings of one panel: the shell's config and which half it is. */
export const panelSettings = (config: FairingConfig, half: 0 | 1) => ({
	size: config.size,
	sections: config.sections.map((s) => ({ ...s })),
	closed: config.closed,
	arealDensity: config.arealDensity,
	baseTop: config.baseTop,
	half
});

function jettison(ctx: {
	config: FairingConfig;
	state: FairingState;
	vessel: {
		spawnDebris?(spec: {
			part: string;
			settings?: Record<string, Record<string, unknown>>;
			offset: { x: number; y: number; z: number };
			velocity: { x: number; y: number; z: number };
		}): void;
	};
}): void {
	const { config, state } = ctx;
	if (state.jettisoned || config.sections.length === 0) return;
	state.jettisoned = true;
	const half = fairingMass(config) / 2;
	const height = config.sections.reduce((h, s) => h + s.height, 0);
	const wide = Math.max(config.size / 2, ...config.sections.map((s) => s.radius));
	const dv = half > 0 ? config.ejectionImpulse / half : 0;
	for (const k of [0, 1] as const) {
		const side = k === 0 ? 1 : -1;
		ctx.vessel.spawnDebris?.({
			part: ModuleFairingPanel.id,
			settings: { [ModuleFairingPanel.id]: panelSettings(config, k) },
			// just outside the shell, so its small collider starts clear of what was inside
			offset: { x: side * (wide + PANEL_CLEARANCE), y: config.baseTop + height / 2, z: 0 },
			velocity: { x: side * dv, y: 0, z: 0 }
		});
	}
}

export const ModuleFairing = defineModule({
	id: 'stock.fairing',
	config: fairingConfigSchema,
	state: (config): FairingState => ({
		jettisoned: false,
		sections: config.sections.map((s) => ({ ...s })),
		closed: config.closed,
		interstage: config.interstage
	}),
	mass: (config, state) => (state.jettisoned ? 0 : fairingMass(config)),
	cost: (config) => fairingCost(config),
	shell: (config, state) =>
		state.jettisoned || !(config.closed || config.interstage) ? null : fairingProfile(config),
	describe: (config, state) => ({
		category: 'structural',
		actions: [
			{
				id: 'jettison',
				label: 'Jettison',
				kind: 'trigger',
				enabled: !state.jettisoned && config.sections.length > 0,
				icon: 'decoupler'
			}
		]
	}),
	onStage: (ctx) => jettison(ctx),
	actions: {
		jettison: (ctx) => jettison(ctx)
	},
	snapshot: (state) => ({
		jettisoned: state.jettisoned,
		shown: !state.jettisoned,
		sections: JSON.stringify(state.sections ?? []),
		closed: state.closed === true,
		interstage: state.interstage === true
	})
});

export const fairingPanelConfigSchema = fairingConfigSchema
	.pick({ size: true, sections: true, closed: true, arealDensity: true, baseTop: true })
	.extend({ half: z.union([z.literal(0), z.literal(1)]) });
export type FairingPanelConfig = z.output<typeof fairingPanelConfigSchema>;

/** One half of a thrown-off shell: half its mass, drawn from the same sections. */
export const ModuleFairingPanel = defineModule({
	id: 'stock.fairing-panel',
	config: fairingPanelConfigSchema,
	state: (config) => ({
		sections: config.sections.map((s) => ({ ...s })),
		closed: config.closed,
		half: config.half
	}),
	mass: (config) => fairingMass({ ...config, ejectionImpulse: 0 } as unknown as FairingConfig) / 2,
	snapshot: (state) => ({
		sections: JSON.stringify(state.sections ?? []),
		closed: state.closed === true,
		half: state.half ?? 0
	})
});
