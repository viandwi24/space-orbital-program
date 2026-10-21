/**
 * Pure helpers of the part model viewer (plan 301): where parts stand in a compare row, how far the
 * camera stands back, how big node markers are, and the module state that drives a model's
 * animations from the viewer's sliders.
 */
import type { PartVisual } from '@orbital/core';

/**
 * Centres along X of parts of the given widths in a row, `gap` m apart, the row centred on 0.
 * A width that is not a positive number counts as 0.
 */
export function rowLayout(widths: readonly number[], gap: number): number[] {
	const w = widths.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
	const total = w.reduce((a, b) => a + b, 0) + gap * Math.max(0, w.length - 1);
	const out: number[] = [];
	let x = -total / 2;
	for (const width of w) {
		out.push(x + width / 2);
		x += width + gap;
	}
	return out;
}

/** The gap of a compare row: a third of the widest part, at least 0.25 m. */
export const rowGap = (widths: readonly number[]): number =>
	Math.max(0.25, Math.max(0, ...widths.filter(Number.isFinite)) / 3);

/**
 * Camera distance from a sphere's centre at which a sphere of `radius` fits the view with a margin,
 * for a vertical field of view `fovDeg` and `aspect` = width / height.
 */
export function frameDistance(
	radius: number,
	fovDeg: number,
	aspect: number,
	margin = 1.15
): number {
	const vfov = (fovDeg * Math.PI) / 180;
	const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(0.1, aspect));
	const half = Math.min(vfov, hfov) / 2;
	return (Math.max(0.05, radius) * margin) / Math.sin(half);
}

/** Radius of a node's marker sphere, m: a fiftieth of the part's size, between 1 cm and 10 cm. */
export const nodeMarkerRadius = (partSize: number): number =>
	Math.min(0.1, Math.max(0.01, partSize / 50));

/** What the viewer's controls say about a model's moving parts. */
export interface ViewerDrive {
	/** Deploy progress, 0..1 (`visual.deploy`). */
	deploy: number;
	/** -1..1: gimbal tilt, hinge angle, extend length, visible (0 = the Hangar's rest pose). */
	art: number;
	/** Plume lit at full throttle, every RCS jet firing, the lamp on. */
	fire: boolean;
}

/** Largest gimbal tilt and hinge angle the slider reaches, rad; the length of a full extend, m. */
export const DRIVE_LIMITS = { gimbal: 0.25, hinge: 0.6, extend: 20, slide: 1 } as const;

/**
 * Module snapshots that make a model show the drive: the deploy flag, the articulation field, and
 * the engine, puff and lamp modules when firing. Specs that name the same module share one record.
 */
export function driveModules(
	visual: PartVisual | undefined,
	drive: ViewerDrive
): Record<string, Record<string, unknown>> {
	const out: Record<string, Record<string, unknown>> = {};
	const put = (module: string, field: string, value: unknown): void => {
		(out[module] ??= {})[field] = value;
	};
	if (!visual) return out;
	if (visual.deploy) put(visual.deploy.module, visual.deploy.flag, clamp01(drive.deploy));
	const a = visual.articulation;
	if (a && drive.art !== 0) {
		const v = Math.max(-1, Math.min(1, drive.art));
		const value =
			a.mode === 'gimbal'
				? [v * DRIVE_LIMITS.gimbal, 0]
				: a.mode === 'hinge'
					? v * DRIVE_LIMITS.hinge
					: a.mode === 'extend'
						? Math.abs(v) * DRIVE_LIMITS.extend
						: a.mode === 'spin'
							? v * Math.PI
							: a.mode === 'slide'
								? Math.abs(v) * DRIVE_LIMITS.slide
								: v > 0;
		put(a.module, a.field, value);
	}
	if (drive.fire) {
		if (visual.plume) {
			put(visual.plume.module, 'ignited', true);
			put(visual.plume.module, 'throttle', 1);
		}
		if (visual.puffs)
			put(
				visual.puffs.module,
				visual.puffs.field,
				visual.puffs.nozzles.map(() => 1)
			);
		if (visual.lamp) put(visual.lamp.module, 'on', true);
	}
	return out;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
