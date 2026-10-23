/**
 * Body names on the map (plan 382, ADR 0319 point 5): where each body's centre is on the screen, how big
 * its disc is there, and which names fit without covering each other. The system overview holds 15 stock
 * bodies, the inner ones a few pixels apart, so the labels are placed biggest body first and one that would
 * overlap a placed one is left out until the player zooms in. Pure: `project` and the names come in.
 */
import type { Vec3 } from '@orbital/core';

export interface ScreenBody {
	id: string;
	x: number;
	y: number;
	/** The disc's radius on the screen, px (0 for a point). */
	radius: number;
	/** A body in front of this one hides its centre. */
	hidden: boolean;
}

export interface BodyLabel {
	id: string;
	text: string;
	x: number;
	y: number;
}

type Project = (world: Vec3) => { x: number; y: number; hidden: boolean } | null;

/** From this many px of disc radius a Space Center's name is shown: Home is near or in focus, not a dot. */
export const SITE_LABEL_MIN_RADIUS = 40;
/** A body whose disc is wider than this share of the view's short side is the view itself: no name over it. */
export const FILLS_VIEW = 0.45;
const CHAR_PX = 6;
const PAD_PX = 6;
const LINE_PX = 15;

/** Where the bodies are on the screen: centre and disc radius. Bodies behind the camera are left out. */
export function projectBodies(
	bodies: ReadonlyArray<{ id: string; position: Vec3 }>,
	radii: ReadonlyMap<string, number>,
	project: Project
): ScreenBody[] {
	const out: ScreenBody[] = [];
	for (const b of bodies) {
		const c = project(b.position);
		if (!c) continue;
		const r = radii.get(b.id) ?? 0;
		let px = 0;
		// The centre is inside the body's own sphere, so `project` calls it hidden. A point a little outside the
		// sphere is hidden only by another body; one of the two sides is never along the view axis.
		let hidden = false;
		if (r > 0) {
			hidden = true;
			for (const edge of [
				{ x: b.position.x + r * 1.05, y: b.position.y, z: b.position.z },
				{ x: b.position.x, y: b.position.y + r * 1.05, z: b.position.z }
			]) {
				const e = project(edge);
				if (!e) continue;
				px = Math.max(px, Math.hypot(e.x - c.x, e.y - c.y) / 1.05);
				if (!e.hidden) hidden = false;
			}
		}
		out.push({ id: b.id, x: c.x, y: c.y, radius: px, hidden });
	}
	return out;
}

/**
 * The names to draw: under each body's disc, biggest body first, skipping any that is off screen, behind
 * another body, fills the view, or would cover a name already placed.
 */
export function placeBodyLabels(
	screen: readonly ScreenBody[],
	name: (id: string) => string,
	width: number,
	height: number
): BodyLabel[] {
	const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
	const out: BodyLabel[] = [];
	const short = Math.min(width, height);
	const order = [...screen].sort((a, b) => b.radius - a.radius || a.id.localeCompare(b.id));
	for (const b of order) {
		if (b.hidden || b.radius > FILLS_VIEW * short) continue;
		const text = name(b.id);
		const w = text.length * CHAR_PX + PAD_PX;
		const x = Math.round(b.x);
		const y = Math.round(b.y + Math.max(b.radius, 4) + 4);
		const box = { x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + LINE_PX };
		if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) continue;
		if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0))
			continue;
		placed.push(box);
		out.push({ id: b.id, text, x, y });
	}
	return out;
}

/** Whether the names of the sites on `body` are shown: its disc is big enough on the screen. */
export const siteLabelsShown = (screen: readonly ScreenBody[], body: string): boolean =>
	(screen.find((b) => b.id === body)?.radius ?? 0) >= SITE_LABEL_MIN_RADIUS;
