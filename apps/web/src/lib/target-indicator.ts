/**
 * The target in the flight view (plan 057, ADR 0084): a distance label at the target's projected
 * position, or an arrow on the screen edge when it is outside the box or behind the camera. Pure:
 * `project` is `Renderer.project` (null behind the camera).
 */
import type { Vec3 } from '@orbital/core';

export interface ScreenXY {
	x: number;
	y: number;
}

export type Indicator =
	| { kind: 'label'; x: number; y: number; hidden: boolean }
	| {
			kind: 'arrow';
			/** Position on the inset border of the box, px. */
			x: number;
			y: number;
			/** Direction towards the target on screen, rad (0 = right, pi/2 = down). */
			angle: number;
	  };

export interface IndicatorInput {
	project: (world: Vec3) => (ScreenXY & { hidden?: boolean }) | null;
	/** The vessel and the target in the world frame `project` takes. */
	vessel: Vec3;
	target: Vec3;
	width: number;
	height: number;
	/** Distance of the arrow and of the label's clamp from the box edge, px. */
	margin?: number;
	/** Pixels the interface panels cover on each side; the indicator lives in what they leave free. */
	insets?: { top: number; right: number; bottom: number; left: number };
}

/** The point where the ray from the box centre along (dx, dy) leaves the box inset by `margin`. */
export function edgePoint(
	width: number,
	height: number,
	dx: number,
	dy: number,
	margin: number
): ScreenXY {
	const cx = width / 2;
	const cy = height / 2;
	const hx = Math.max(1, cx - margin);
	const hy = Math.max(1, cy - margin);
	const len = Math.hypot(dx, dy);
	if (len === 0) return { x: cx, y: cy + hy };
	const k = Math.min(hx / Math.abs(dx || 1e-12), hy / Math.abs(dy || 1e-12));
	return { x: cx + dx * k, y: cy + dy * k };
}

/** Null only for a box with no area. */
export function targetIndicator(input: IndicatorInput): Indicator | null {
	const { project, vessel, target } = input;
	const margin = input.margin ?? 28;
	const ins = input.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
	const x0 = ins.left;
	const y0 = ins.top;
	const width = input.width - ins.left - ins.right;
	const height = input.height - ins.top - ins.bottom;
	if (!(width > 0) || !(height > 0)) return null;
	const cx = x0 + width / 2;
	const cy = y0 + height / 2;
	const at = project(target);
	if (
		at &&
		at.x >= x0 + margin &&
		at.x <= x0 + width - margin &&
		at.y >= y0 + margin &&
		at.y <= y0 + height - margin
	) {
		return { kind: 'label', x: at.x, y: at.y, hidden: at.hidden === true };
	}
	let dx: number;
	let dy: number;
	if (at) {
		dx = at.x - cx;
		dy = at.y - cy;
	} else {
		// Behind the camera: the camera looks at the vessel, so the target lies opposite the projection
		// of its mirror image through the vessel, seen from the vessel's own projection.
		const mirror = project({
			x: 2 * vessel.x - target.x,
			y: 2 * vessel.y - target.y,
			z: 2 * vessel.z - target.z
		});
		const from = project(vessel) ?? { x: cx, y: cy };
		if (mirror) {
			dx = from.x - mirror.x;
			dy = from.y - mirror.y;
		} else {
			dx = 0;
			dy = 1;
		}
	}
	const edge = edgePoint(width, height, dx, dy, margin);
	return { kind: 'arrow', x: x0 + edge.x, y: y0 + edge.y, angle: Math.atan2(dy, dx) };
}
