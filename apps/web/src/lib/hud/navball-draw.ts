/**
 * Canvas2D painter of the navball (plan 021, ADR 0026). All geometry comes from `navball-math.ts`;
 * this file only strokes and fills. It runs from the render loop, outside Svelte reactivity.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	elevationCircle,
	groundRegion,
	horizonDirection,
	localHorizon,
	meridian,
	projectDirection,
	visibleRuns,
	type BallPoint,
	type Marker,
	type MarkerKind
} from '../navball-math';

export interface NavballFrame {
	orientation: Quat;
	/** Position of the vessel in BCI (defines the local horizon). */
	position: Vec3;
	markers: Marker[];
	/** Nose heading, rad, to place the pitch labels in front of the nose. */
	heading: number;
}

export interface NavballTheme {
	skyTop: string;
	skyBottom: string;
	groundTop: string;
	groundBottom: string;
	line: string;
	text: string;
	accent: string;
	positive: string;
	violet: string;
	warning: string;
}

/** Reads the colour tokens from the element so the painter follows tokens.css. */
export function themeFrom(el: Element): NavballTheme {
	const css = getComputedStyle(el);
	const v = (name: string): string => css.getPropertyValue(name).trim();
	return {
		skyTop: v('--ball-sky-top'),
		skyBottom: v('--ball-sky-bottom'),
		groundTop: v('--ball-ground-top'),
		groundBottom: v('--ball-ground-bottom'),
		line: 'rgba(255,255,255,0.85)',
		text: v('--text'),
		accent: v('--c-accent'),
		positive: v('--c-positive'),
		violet: v('--c-violet'),
		warning: v('--c-warning')
	};
}

const DEG = Math.PI / 180;

/** `size` is the canvas CSS size in px; the context is already scaled by the device pixel ratio. */
export function drawNavball(
	ctx: CanvasRenderingContext2D,
	size: number,
	frame: NavballFrame,
	theme: NavballTheme
): void {
	const R = size / 2 - 5;
	const cx = size / 2;
	const cy = size / 2;
	const px = (p: BallPoint): [number, number] => [cx + p.x * R, cy - p.y * R];
	const h = localHorizon(frame.position);
	const q = frame.orientation;

	ctx.clearRect(0, 0, size, size);
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, Math.PI * 2);
	ctx.clip();

	// Sky and ground. The sky gradient follows the vessel's up on the ball so the sphere reads as lit.
	const sky = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
	sky.addColorStop(0, theme.skyTop);
	sky.addColorStop(1, theme.skyBottom);
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, size, size);

	const ground = groundRegion(h, q);
	const groundFill = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
	groundFill.addColorStop(0, theme.groundTop);
	groundFill.addColorStop(1, theme.groundBottom);
	ctx.fillStyle = groundFill;
	if (ground.kind === 'full') {
		ctx.fillRect(0, 0, size, size);
	} else if (ground.kind === 'region') {
		ctx.beginPath();
		ground.horizon.forEach((p, i) => {
			const [x, y] = px(p);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		// Math angles (y up) to canvas angles (y down): negate; counter-clockwise stays "anticlockwise".
		ctx.arc(cx, cy, R, -ground.rimFrom, -ground.rimTo, ground.ccw);
		ctx.closePath();
		ctx.fill();
	}

	const stroke = (dirs: Vec3[], width: number, color: string, alpha = 1): void => {
		ctx.lineWidth = width;
		ctx.strokeStyle = color;
		ctx.globalAlpha = alpha;
		for (const run of visibleRuns(dirs, q)) {
			ctx.beginPath();
			run.forEach((p, i) => {
				const [x, y] = px(p);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	};

	// Graticule: parallels every 15 degrees, meridians every 30.
	for (let e = -75; e <= 75; e += 15) {
		if (e !== 0) stroke(elevationCircle(h, e * DEG), 1, theme.line, 0.28);
	}
	for (let a = 0; a < 360; a += 30)
		stroke(meridian(h, a * DEG, -75 * DEG, 75 * DEG), 1, theme.line, 0.16);
	stroke(elevationCircle(h, 0), 2, theme.line, 0.95);

	// Heading ticks and labels on the horizon.
	ctx.font = `600 ${Math.max(9, Math.round(size / 17))}px "Barlow Semi Condensed", sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (let a = 0; a < 360; a += 10) {
		const long = a % 30 === 0;
		const t = (long ? 3.2 : 1.8) * DEG;
		stroke(
			[horizonDirection(h, a * DEG, -t), horizonDirection(h, a * DEG, t)],
			long ? 2 : 1,
			theme.line,
			0.9
		);
		if (long) {
			const label =
				a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : `${a / 10}`;
			const p = projectDirection(horizonDirection(h, a * DEG, 6.5 * DEG), q);
			if (p.z > 0.2) {
				const [x, y] = px(p);
				ctx.fillStyle = theme.text;
				ctx.globalAlpha = Math.min(1, p.z * 1.6);
				ctx.fillText(label, x, y);
				ctx.globalAlpha = 1;
			}
		}
	}
	// Pitch labels along the nose heading.
	ctx.font = `500 ${Math.max(8, Math.round(size / 19))}px "IBM Plex Mono", monospace`;
	for (const e of [-60, -30, 30, 60]) {
		const p = projectDirection(horizonDirection(h, frame.heading, e * DEG), q);
		if (p.z > 0.25) {
			const [x, y] = px(p);
			ctx.fillStyle = theme.text;
			ctx.globalAlpha = 0.85;
			ctx.fillText(`${Math.abs(e)}`, x, y);
			ctx.globalAlpha = 1;
		}
	}

	// Markers.
	for (const m of frame.markers)
		drawMarker(ctx, px, projectDirection(m.dir, q), m.kind, size, theme);

	// Sphere shading: a soft highlight and a darker rim.
	const shade = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
	shade.addColorStop(0, 'rgba(255,255,255,0.16)');
	shade.addColorStop(0.55, 'rgba(255,255,255,0)');
	shade.addColorStop(1, 'rgba(0,0,0,0.5)');
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, size, size);
	ctx.restore();

	// Rim.
	ctx.lineWidth = 2;
	ctx.strokeStyle = 'rgba(150,180,210,0.55)';
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, Math.PI * 2);
	ctx.stroke();

	// Vessel reticle: fixed at the centre, the nose points through it.
	ctx.lineWidth = 2.5;
	ctx.strokeStyle = theme.warning;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const w = R * 0.34;
	ctx.beginPath();
	ctx.moveTo(cx - w, cy + 3);
	ctx.lineTo(cx - w * 0.38, cy + 3);
	ctx.lineTo(cx, cy - R * 0.06);
	ctx.lineTo(cx + w * 0.38, cy + 3);
	ctx.lineTo(cx + w, cy + 3);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
	ctx.fillStyle = theme.warning;
	ctx.fill();
}

function drawMarker(
	ctx: CanvasRenderingContext2D,
	px: (p: BallPoint) => [number, number],
	p: BallPoint,
	kind: MarkerKind,
	size: number,
	theme: NavballTheme
): void {
	const behind = p.z < 0;
	let at = p;
	if (behind) {
		const m = Math.hypot(p.x, p.y) || 1;
		at = { x: (p.x / m) * 0.98, y: (p.y / m) * 0.98, z: 0 };
	}
	const [x, y] = px(at);
	const s = size * (behind ? 0.035 : 0.055);
	const color =
		kind === 'prograde' || kind === 'retrograde'
			? theme.positive
			: kind === 'normal' || kind === 'anti-normal'
				? theme.violet
				: theme.accent;
	ctx.save();
	ctx.globalAlpha = behind ? 0.55 : 1;
	ctx.translate(x, y);
	ctx.lineWidth = 2;
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	// A dark halo keeps the glyph readable on sky and ground alike.
	ctx.shadowColor = 'rgba(0,0,0,0.7)';
	ctx.shadowBlur = 3;
	ctx.beginPath();
	switch (kind) {
		case 'prograde':
			ctx.arc(0, 0, s, 0, Math.PI * 2);
			ctx.moveTo(0, -s);
			ctx.lineTo(0, -s * 1.7);
			ctx.moveTo(-s, 0);
			ctx.lineTo(-s * 1.7, 0);
			ctx.moveTo(s, 0);
			ctx.lineTo(s * 1.7, 0);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
			ctx.fill();
			break;
		case 'retrograde':
			ctx.arc(0, 0, s, 0, Math.PI * 2);
			ctx.moveTo(-s * 0.7, -s * 0.7);
			ctx.lineTo(s * 0.7, s * 0.7);
			ctx.moveTo(s * 0.7, -s * 0.7);
			ctx.lineTo(-s * 0.7, s * 0.7);
			ctx.stroke();
			break;
		case 'normal':
		case 'anti-normal': {
			const k = kind === 'normal' ? -1 : 1;
			ctx.moveTo(0, k * s * 1.1);
			ctx.lineTo(-s, -k * s * 0.8);
			ctx.lineTo(s, -k * s * 0.8);
			ctx.closePath();
			if (kind === 'normal') ctx.fill();
			else ctx.stroke();
			break;
		}
		case 'radial-out':
		case 'radial-in':
			ctx.moveTo(0, -s);
			ctx.lineTo(s, 0);
			ctx.lineTo(0, s);
			ctx.lineTo(-s, 0);
			ctx.closePath();
			if (kind === 'radial-out') ctx.fill();
			else ctx.stroke();
			break;
	}
	ctx.restore();
}
