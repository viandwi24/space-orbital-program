/**
 * Mod overlays (plan 347, ADR 0296): world-space shapes as plain data that the renderer draws in
 * Flight and the map. Mods never touch three.js; they hand over polylines, markers and labels at
 * points relative to a body, within fixed budgets. Environment-neutral.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN, type EntityId } from './ids.ts';
import type { Vec3 } from './math.ts';
import type { PanelInput } from './panels.ts';

/**
 * Where a shape's points are: offsets from the centre of `body`, in the shared inertial axes
 * (`inertial`, like vessel positions) or in the body's own turning axes (`body-fixed`, for points
 * on the ground).
 */
export type OverlayFrame = 'inertial' | 'body-fixed';

interface ShapeBase {
	body: string;
	frame: OverlayFrame;
	/** `#rrggbb` or `#rrggbbaa`. */
	color: string;
	/** `on-top` (the default) draws through terrain and parts; `test` hides behind them. */
	depth?: 'test' | 'on-top';
	/** Where it shows (default both). */
	views?: readonly ('flight' | 'map')[];
	/** Shown only while the player flies this vessel. */
	vessel?: EntityId;
}

export type OverlayShape =
	| (ShapeBase & {
			kind: 'polyline';
			points: readonly Vec3[];
			/** Line width, px (1 to 8, default 2). */
			width?: number;
			/** Dashes along the line, metres. */
			dash?: { on: number; off: number };
	  })
	| (ShapeBase & {
			kind: 'marker';
			position: Vec3;
			style: 'cross' | 'ring' | 'dot' | 'target';
			/** Size on screen, px (6 to 64, default 20). */
			size?: number;
	  })
	| (ShapeBase & { kind: 'label'; position: Vec3; text: string });

/** Per-overlay budgets (ADR 0296 point 2). */
export const OVERLAY_LIMITS = { shapes: 64, points: 4_096, labels: 16, text: 40 } as const;

export interface OverlayDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	/** Its name in Settings → Overlays. */
	title: string;
	description?: string;
	/** Shown in a new install until the player turns it off. */
	defaultOn: boolean;
	/** Page-side shapes from the panel input, `rate` times a second (1 to 30, default 10). */
	draw?(input: PanelInput): readonly OverlayShape[];
	rate?: number;
}

export const overlayDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	title: z.string().min(1),
	description: z.string().optional(),
	defaultOn: z.boolean(),
	draw: z
		.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', 'expected a function')
		.optional(),
	rate: z.number().min(1).max(30).optional()
});

/** What a sim system published for an overlay (`Snapshot.overlays`). */
export interface OverlayLayer {
	shapes: OverlayShape[];
	/** Small numbers and strings for the mod's panel. */
	meta?: Record<string, number | string>;
}

const finite = z.number().refine(Number.isFinite, 'expected a finite number');
const vec3 = z.object({ x: finite, y: finite, z: finite });
const base = {
	body: z.string().min(1),
	frame: z.enum(['inertial', 'body-fixed']),
	color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'expected #rrggbb or #rrggbbaa'),
	depth: z.enum(['test', 'on-top']).optional(),
	views: z.array(z.enum(['flight', 'map'])).optional(),
	vessel: z.int().nonnegative().optional()
};
export const overlayShapeSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('polyline'),
		...base,
		points: z.array(vec3).min(2),
		width: z.number().min(1).max(8).optional(),
		dash: z.object({ on: z.number().positive(), off: z.number().positive() }).optional()
	}),
	z.object({
		kind: z.literal('marker'),
		...base,
		position: vec3,
		style: z.enum(['cross', 'ring', 'dot', 'target']),
		size: z.number().min(6).max(64).optional()
	}),
	z.object({ kind: z.literal('label'), ...base, position: vec3, text: z.string() })
]);

/**
 * The shapes within the budgets (ADR 0296 point 2): invalid shapes are dropped, a label's text is
 * cut, and shapes past a budget are dropped. `dropped` says what went, for the mod author.
 */
export function clampOverlay(raw: readonly unknown[]): {
	shapes: OverlayShape[];
	dropped: string[];
} {
	const shapes: OverlayShape[] = [];
	const dropped: string[] = [];
	let points = 0;
	let labels = 0;
	for (const [i, item] of raw.entries()) {
		if (shapes.length >= OVERLAY_LIMITS.shapes) {
			dropped.push(`${raw.length - i} shapes over the ${OVERLAY_LIMITS.shapes}-shape budget`);
			break;
		}
		const parsed = overlayShapeSchema.safeParse(item);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			dropped.push(
				`shape ${i}: ${issue ? `${issue.path.join('.') || '(shape)'}: ${issue.message}` : 'invalid'}`
			);
			continue;
		}
		const s = parsed.data as OverlayShape;
		if (s.kind === 'polyline') {
			if (points + s.points.length > OVERLAY_LIMITS.points) {
				dropped.push(`shape ${i}: over the ${OVERLAY_LIMITS.points}-point budget`);
				continue;
			}
			points += s.points.length;
		} else if (s.kind === 'label') {
			if (labels >= OVERLAY_LIMITS.labels) {
				dropped.push(`shape ${i}: over the ${OVERLAY_LIMITS.labels}-label budget`);
				continue;
			}
			labels++;
			if (s.text.length > OVERLAY_LIMITS.text)
				shapes.push({ ...s, text: s.text.slice(0, OVERLAY_LIMITS.text) });
			else shapes.push(s);
			continue;
		}
		shapes.push(s);
	}
	return { shapes, dropped };
}

/** `meta` kept: finite numbers and strings up to 80 characters, at most 16 keys. */
export function cleanMeta(raw: unknown): Record<string, number | string> | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const out: Record<string, number | string> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 16)) {
		if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
		else if (typeof v === 'string') out[k] = v.slice(0, 80);
	}
	return out;
}

/** Points of a polyline cut into dashes (`on` metres drawn, `off` skipped), as pairs of segment ends. */
export function dashSegments(
	points: readonly Vec3[],
	dash: { on: number; off: number } | undefined
): Vec3[] {
	const out: Vec3[] = [];
	if (!dash) {
		for (let i = 1; i < points.length; i++) out.push(points[i - 1]!, points[i]!);
		return out;
	}
	const period = dash.on + dash.off;
	let s = 0; // distance along the line where the current segment starts
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
		if (len === 0) continue;
		let t = 0;
		while (t < len) {
			const phase = (s + t) % period;
			const drawing = phase < dash.on;
			const step = Math.min(len - t, (drawing ? dash.on : period) - phase);
			if (drawing) {
				const at = (u: number): Vec3 => ({
					x: a.x + ((b.x - a.x) * u) / len,
					y: a.y + ((b.y - a.y) * u) / len,
					z: a.z + ((b.z - a.z) * u) / len
				});
				out.push(at(t), at(t + step));
			}
			t += step;
		}
		s += len;
	}
	return out;
}
