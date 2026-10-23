/**
 * Crew portraits (plan 341, ADR 0291 point 5): the character's head and shoulders painted on a 2D
 * canvas from the same spec as the 3D figure (outfit, look, expression), at the figure's own
 * proportions, and cached as data URLs. No WebGL context is opened for a face.
 */
import {
	DEFAULT_APPEARANCE,
	crewContentVersion,
	expressionOf,
	outfitOf,
	portraitImageOf,
	type Appearance,
	type CharacterSpec,
	type Expression,
	type Outfit
} from './outfits.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const hex = (c: number, a = 1): string => {
	const r = (c >> 16) & 255;
	const g = (c >> 8) & 255;
	const b = c & 255;
	return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
const shade = (c: number, k: number): number => {
	const f = (v: number) =>
		Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
	return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

const HEAD = { y: 1.27, a: 0.29, b: 0.315, n: 2.6 } as const;

/** Paints a portrait into a `size` square: transparent outside a round backdrop. */
export function paintPortrait(ctx: Ctx, size: number, spec: CharacterSpec, backdrop = true): void {
	const o = outfitOf(spec.outfit);
	const look = spec.appearance ?? DEFAULT_APPEARANCE;
	const ex = expressionOf(spec.expression);
	const S = size;
	const s = S * 0.97; // px per metre
	const cy = S * 0.47;
	const X = (x: number) => S / 2 + x * s;
	const Y = (y: number) => cy - (y - HEAD.y) * s;
	const skin = look.skin;
	ctx.save();
	ctx.clearRect(0, 0, S, S);
	if (backdrop) {
		const g = ctx.createRadialGradient(S / 2, S * 0.4, S * 0.1, S / 2, S / 2, S * 0.7);
		g.addColorStop(0, '#2b3a5c');
		g.addColorStop(1, '#141b2b');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.clip();
	}
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	// --- shoulders -------------------------------------------------------------------------------
	if (o.pack !== 'none') {
		ctx.fillStyle = hex(o.pack === 'eva' ? 0xe6e2da : 0x3a3f48);
		round(ctx, X(-0.3), Y(1.0), 0.6 * s, 0.5 * s, 0.12 * s);
		ctx.fill();
	}
	const body = ctx.createLinearGradient(X(-0.3), 0, X(0.3), 0);
	body.addColorStop(0, hex(shade(o.suit, -0.18)));
	body.addColorStop(0.5, hex(o.suit));
	body.addColorStop(1, hex(shade(o.suit, -0.25)));
	ctx.fillStyle = body;
	ctx.beginPath();
	ctx.moveTo(X(-0.36), Y(0.55));
	ctx.bezierCurveTo(X(-0.36), Y(0.9), X(-0.24), Y(0.99), X(0), Y(0.99));
	ctx.bezierCurveTo(X(0.24), Y(0.99), X(0.36), Y(0.9), X(0.36), Y(0.55));
	ctx.closePath();
	ctx.fill();
	if (o.body === 'coat') {
		ctx.fillStyle = hex(o.trim);
		for (const side of [1, -1]) {
			ctx.beginPath();
			ctx.moveTo(X(side * 0.05), Y(0.96));
			ctx.lineTo(X(side * 0.16), Y(0.93));
			ctx.lineTo(X(side * 0.04), Y(0.72));
			ctx.closePath();
			ctx.fill();
		}
		ctx.fillStyle = hex(o.legs);
		ctx.beginPath();
		ctx.moveTo(X(-0.05), Y(0.96));
		ctx.lineTo(X(0.05), Y(0.96));
		ctx.lineTo(X(0), Y(0.8));
		ctx.fill();
		if (o.tie !== undefined) {
			ctx.fillStyle = hex(o.accent);
			ctx.fillRect(X(-0.015), Y(0.92), 0.03 * s, 0.2 * s);
		}
		if (o.stethoscope) {
			ctx.strokeStyle = hex(0x2b2e34);
			ctx.lineWidth = 0.014 * s;
			ctx.beginPath();
			ctx.arc(X(0), Y(0.95), 0.14 * s, 0.2, Math.PI - 0.2);
			ctx.stroke();
		}
	} else if (o.harness) {
		ctx.fillStyle = hex(0x2b2e34);
		for (const side of [1, -1]) ctx.fillRect(X(side * 0.075 - 0.02), Y(0.95), 0.04 * s, 0.4 * s);
	}
	if (o.body === 'suit') {
		ctx.fillStyle = hex(o.accent);
		ctx.beginPath();
		ctx.arc(X(0.17), Y(0.8), 0.045 * s, 0, Math.PI * 2);
		ctx.fill();
	}
	if (o.body === 'shirt') {
		ctx.fillStyle = hex(o.accent);
		for (const [x, y] of [
			[-0.2, 0.8],
			[0.15, 0.85],
			[0.25, 0.65],
			[-0.12, 0.62]
		] as const) {
			ctx.beginPath();
			ctx.arc(X(x), Y(y), 0.032 * s, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	// collar
	ctx.strokeStyle = hex(o.trim);
	ctx.lineWidth = 0.06 * s;
	ctx.beginPath();
	ctx.ellipse(X(0), Y(0.955), 0.13 * s, 0.035 * s, 0, 0, Math.PI * 2);
	ctx.stroke();

	// --- head ------------------------------------------------------------------------------------
	const headPath = (grow = 0): void => {
		ctx.beginPath();
		for (let i = 0; i <= 64; i++) {
			const t = (i / 64) * Math.PI * 2;
			const c = Math.cos(t);
			const sn = Math.sin(t);
			const x = Math.sign(c) * Math.abs(c) ** (2 / HEAD.n) * (HEAD.a + grow);
			const y = Math.sign(sn) * Math.abs(sn) ** (2 / HEAD.n) * (HEAD.b + grow);
			if (i === 0) ctx.moveTo(X(x), Y(HEAD.y + y));
			else ctx.lineTo(X(x), Y(HEAD.y + y));
		}
		ctx.closePath();
	};
	ctx.fillStyle = hex(skin);
	for (const side of [1, -1]) {
		ctx.beginPath();
		ctx.ellipse(X(side * 0.285), Y(1.25), 0.04 * s, 0.06 * s, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	const face = ctx.createRadialGradient(X(-0.08), Y(1.38), 0.05 * s, X(0), Y(1.27), 0.4 * s);
	face.addColorStop(0, hex(shade(skin, 0.25)));
	face.addColorStop(0.7, hex(skin));
	face.addColorStop(1, hex(shade(skin, -0.18)));
	ctx.fillStyle = face;
	headPath();
	ctx.fill();

	// back hair is hidden behind the head; the crown and fringe go on top
	const cover =
		o.headwear === 'hard-hat' || o.headwear === 'cap'
			? 'hat'
			: o.headwear === 'helmet' && !spec.noHelmet
				? 'helmet'
				: 'none';
	paintHair(ctx, look, cover, X, Y, s);

	// --- face ------------------------------------------------------------------------------------
	paintFace(ctx, ex, o, look.eyeColour, X, Y, s);
	paintHeadwear(ctx, o, spec.noHelmet ?? false, X, Y, s, headPath);
	ctx.restore();
}

function round(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

const rng = (seed: number): (() => number) => {
	let v = seed >>> 0 || 1;
	return () => {
		v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
		return v / 2 ** 32;
	};
};

function paintHair(
	ctx: Ctx,
	look: Appearance,
	cover: 'none' | 'hat' | 'helmet',
	X: (x: number) => number,
	Y: (y: number) => number,
	s: number
): void {
	const r = rng(look.seed);
	const c = look.hairColour;
	const grad = ctx.createLinearGradient(0, Y(1.72), 0, Y(1.4));
	grad.addColorStop(0, hex(shade(c, 0.15)));
	grad.addColorStop(1, hex(shade(c, -0.15)));
	ctx.fillStyle = grad;
	// the cap over the crown
	ctx.beginPath();
	ctx.moveTo(X(-0.305), Y(1.36));
	ctx.bezierCurveTo(X(-0.31), Y(1.62), X(-0.12), Y(1.615), X(0), Y(1.61));
	ctx.bezierCurveTo(X(0.12), Y(1.615), X(0.31), Y(1.62), X(0.305), Y(1.36));
	ctx.bezierCurveTo(X(0.22), Y(1.45), X(0.1), Y(1.47), X(0), Y(1.46));
	ctx.bezierCurveTo(X(-0.1), Y(1.47), X(-0.22), Y(1.45), X(-0.305), Y(1.36));
	ctx.fill();
	// fringe tufts over the forehead
	const fringe = look.hairStyle === 'swept' ? 4 : 3;
	for (let i = 0; i < fringe; i++) {
		const u = i / (fringe - 1) - 0.5;
		const x = u * 0.3 + (r() - 0.5) * 0.03;
		const sw = look.hairStyle === 'swept' ? 0.06 : 0;
		ctx.beginPath();
		ctx.moveTo(X(x - 0.07), Y(1.5));
		ctx.quadraticCurveTo(X(x + u * 0.05 + sw), Y(1.44), X(x + u * 0.09 + sw), Y(1.34 - r() * 0.03));
		ctx.quadraticCurveTo(X(x + 0.04 + sw), Y(1.45), X(x + 0.08), Y(1.52));
		ctx.closePath();
		ctx.fill();
	}
	if (cover !== 'none') return;
	const n = look.hairStyle === 'short' ? 4 : 6;
	const len = look.hairStyle === 'short' ? 0.08 : 0.14;
	for (let i = 0; i < n; i++) {
		const u = i / (n - 1) - 0.5;
		const x = u * 0.42;
		const base = 1.6 - Math.abs(u) * 0.12;
		const lean = look.hairStyle === 'swept' ? 0.12 : u * 0.2 + (r() - 0.5) * 0.08;
		const l = len + r() * 0.05;
		ctx.beginPath();
		ctx.moveTo(X(x - 0.07), Y(base - 0.04));
		ctx.quadraticCurveTo(X(x + lean * 0.4), Y(base + l * 0.7), X(x + lean), Y(base + l));
		ctx.quadraticCurveTo(X(x + 0.03 + lean * 0.3), Y(base + l * 0.4), X(x + 0.07), Y(base - 0.04));
		ctx.closePath();
		ctx.fill();
	}
}

function paintFace(
	ctx: Ctx,
	ex: Expression,
	o: Outfit,
	eyeColour: number,
	X: (x: number) => number,
	Y: (y: number) => number,
	s: number
): void {
	const ey = 1.245;
	const dark = hex(eyeColour);
	const bright = (c: number, k: number): number =>
		(Math.min(255, Math.round(((c >> 16) & 255) * k)) << 16) |
		(Math.min(255, Math.round(((c >> 8) & 255) * k)) << 8) |
		Math.min(255, Math.round((c & 255) * k));
	const openEye = (side: number, k = 1): void => {
		const x = side * 0.112;
		const g = ctx.createLinearGradient(0, Y(ey + 0.08), 0, Y(ey - 0.08));
		g.addColorStop(0, hex(bright(eyeColour, 0.62)));
		g.addColorStop(1, hex(bright(eyeColour, 2.1)));
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(X(x), Y(ey), 0.06 * k * s, 0.078 * k * s, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(X(x + side * 0.018), Y(ey + 0.03), 0.021 * s, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(X(x - side * 0.022), Y(ey - 0.03), 0.01 * s, 0, Math.PI * 2);
		ctx.fill();
	};
	const closedEye = (side: number, up: boolean): void => {
		ctx.strokeStyle = dark;
		ctx.lineWidth = 0.022 * s;
		ctx.beginPath();
		if (up) ctx.arc(X(side * 0.112), Y(ey - 0.02), 0.045 * s, Math.PI * 1.1, Math.PI * 1.9);
		else ctx.arc(X(side * 0.112), Y(ey + 0.02), 0.045 * s, Math.PI * 0.1, Math.PI * 0.9);
		ctx.stroke();
	};
	const { left, right } = ex.eyes;
	if (!(o.eyewear === 'sunglasses' && left === 'open' && right === 'open')) {
		for (const [side, shape] of [
			[1, left],
			[-1, right]
		] as const) {
			if (shape === 'closed-up' || shape === 'closed-down') closedEye(side, shape === 'closed-up');
			else openEye(side, shape === 'wide' ? 1.1 : shape === 'big' ? 1.05 : 1);
		}
	}

	// brows
	const [tl, tr] = ex.brows?.tilt ?? [0.08, 0.08];
	const by = 1.35 + (ex.brows?.lift ?? 0);
	const [rl, rr] = ex.brows?.raise ?? [0, 0];
	ctx.strokeStyle = '#4a2c18';
	ctx.lineWidth = 0.022 * s;
	for (const [side, t, raise] of [
		[1, tl, rl],
		[-1, tr, rr]
	] as const) {
		const y = by + raise;
		const dx = Math.cos(t) * 0.035;
		const dy = Math.sin(t) * 0.035;
		ctx.beginPath();
		ctx.moveTo(X(side * 0.112 - side * dx), Y(y - dy));
		ctx.lineTo(X(side * 0.112 + side * dx), Y(y + dy));
		ctx.stroke();
	}
	// cheeks
	ctx.fillStyle = 'rgba(242,154,180,0.65)';
	for (const side of [1, -1]) {
		ctx.beginPath();
		ctx.ellipse(X(side * 0.182), Y(1.155), 0.042 * s, 0.024 * s, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	// mouth
	const my = 1.125;
	ctx.fillStyle = '#5a1e24';
	ctx.strokeStyle = '#5a1e24';
	ctx.lineWidth = 0.02 * s;
	switch (ex.mouth) {
		case 'smile':
		case 'grin': {
			const k = ex.mouth === 'grin' ? 1.3 : 1;
			ctx.beginPath();
			ctx.moveTo(X(-0.06 * k), Y(my + 0.012));
			ctx.lineTo(X(0.06 * k), Y(my + 0.012));
			ctx.bezierCurveTo(
				X(0.06 * k),
				Y(my - 0.05 * k),
				X(-0.06 * k),
				Y(my - 0.05 * k),
				X(-0.06 * k),
				Y(my + 0.012)
			);
			ctx.fill();
			ctx.fillStyle = '#e8747c';
			ctx.beginPath();
			ctx.ellipse(X(0), Y(my - 0.02 * k), 0.028 * k * s, 0.014 * k * s, 0, 0, Math.PI * 2);
			ctx.fill();
			break;
		}
		case 'o':
			ctx.beginPath();
			ctx.ellipse(X(0), Y(my - 0.005), 0.032 * s, 0.042 * s, 0, 0, Math.PI * 2);
			ctx.fill();
			break;
		case 'small-o':
			ctx.beginPath();
			ctx.ellipse(X(0), Y(my), 0.02 * s, 0.024 * s, 0, 0, Math.PI * 2);
			ctx.fill();
			break;
		case 'tilt':
			ctx.beginPath();
			ctx.moveTo(X(-0.02), Y(my - 0.008));
			ctx.lineTo(X(0.045), Y(my + 0.01));
			ctx.stroke();
			break;
		case 'frown':
			ctx.beginPath();
			ctx.arc(X(0), Y(my - 0.035), 0.04 * s, Math.PI * 1.15, Math.PI * 1.85);
			ctx.stroke();
			break;
	}
}

function paintHeadwear(
	ctx: Ctx,
	o: Outfit,
	noHelmet: boolean,
	X: (x: number) => number,
	Y: (y: number) => number,
	s: number,
	headPath: (grow?: number) => void
): void {
	const ey = 1.245;
	if (o.eyewear === 'glasses') {
		ctx.strokeStyle = '#2b2e34';
		ctx.lineWidth = 0.016 * s;
		for (const side of [1, -1]) {
			ctx.beginPath();
			ctx.arc(X(side * 0.112), Y(ey), 0.075 * s, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.moveTo(X(-0.04), Y(ey + 0.02));
		ctx.lineTo(X(0.04), Y(ey + 0.02));
		ctx.stroke();
	} else if (o.eyewear === 'sunglasses') {
		ctx.fillStyle = '#1b2a3c';
		for (const side of [1, -1]) {
			ctx.beginPath();
			ctx.ellipse(X(side * 0.112), Y(ey), 0.075 * s, 0.06 * s, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = 'rgba(255,255,255,0.35)';
		ctx.beginPath();
		ctx.ellipse(X(0.13), Y(ey + 0.02), 0.025 * s, 0.012 * s, -0.4, 0, Math.PI * 2);
		ctx.fill();
	}
	const hy = HEAD.y;
	switch (o.headwear) {
		case 'helmet': {
			if (noHelmet) return;
			ctx.fillStyle = 'rgba(190,220,255,0.12)';
			ctx.beginPath();
			ctx.arc(X(0), Y(hy + 0.02), 0.43 * s, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = hex(o.headwearColour);
			ctx.lineWidth = 0.06 * s;
			ctx.stroke();
			ctx.strokeStyle = hex(o.accent);
			ctx.lineWidth = 0.014 * s;
			ctx.beginPath();
			ctx.arc(X(0), Y(hy + 0.02), 0.4 * s, Math.PI * 1.15, Math.PI * 1.85);
			ctx.stroke();
			ctx.fillStyle = 'rgba(255,255,255,0.4)';
			ctx.beginPath();
			ctx.ellipse(X(-0.2), Y(hy + 0.2), 0.06 * s, 0.025 * s, -0.7, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		case 'hard-hat': {
			ctx.fillStyle = hex(o.headwearColour);
			ctx.beginPath();
			ctx.ellipse(X(0), Y(hy + 0.17), 0.33 * s, 0.21 * s, 0, Math.PI, 0);
			ctx.fill();
			ctx.fillRect(X(-0.37), Y(hy + 0.18), 0.74 * s, 0.03 * s);
			ctx.fillStyle = hex(shade(o.headwearColour, 0.2));
			ctx.fillRect(X(-0.025), Y(hy + 0.37), 0.05 * s, 0.19 * s);
			return;
		}
		case 'cap': {
			ctx.fillStyle = hex(o.headwearColour);
			ctx.beginPath();
			ctx.ellipse(X(0), Y(hy + 0.2), 0.305 * s, 0.17 * s, 0, Math.PI, 0);
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(X(0), Y(hy + 0.19), 0.2 * s, 0.035 * s, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = hex(o.accent);
			ctx.beginPath();
			ctx.arc(X(0), Y(hy + 0.28), 0.04 * s, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		case 'headset': {
			ctx.strokeStyle = hex(o.headwearColour);
			ctx.lineWidth = 0.04 * s;
			ctx.beginPath();
			ctx.arc(X(0), Y(hy + 0.02), 0.32 * s, Math.PI, 0);
			ctx.stroke();
			ctx.fillStyle = hex(o.headwearColour);
			for (const side of [1, -1]) {
				round(ctx, X(side * 0.3 - 0.045), Y(hy + 0.06), 0.09 * s, 0.16 * s, 0.04 * s);
				ctx.fill();
			}
			ctx.lineWidth = 0.016 * s;
			ctx.beginPath();
			ctx.moveTo(X(0.3), Y(hy - 0.08));
			ctx.quadraticCurveTo(X(0.26), Y(hy - 0.15), X(0.14), Y(hy - 0.15));
			ctx.stroke();
			return;
		}
		case 'goggles':
		case 'pilot-goggles': {
			const y = hy + 0.17;
			ctx.fillStyle = hex(o.headwearColour);
			ctx.fillRect(X(-0.3), Y(y + 0.03), 0.6 * s, 0.06 * s);
			for (const side of [1, -1]) {
				ctx.fillStyle = '#a9b0b9';
				ctx.beginPath();
				ctx.arc(X(side * 0.1), Y(y), 0.07 * s, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#3a6f9a';
				ctx.beginPath();
				ctx.arc(X(side * 0.1), Y(y), 0.05 * s, 0, Math.PI * 2);
				ctx.fill();
			}
			return;
		}
		case 'none':
			void headPath;
			return;
	}
}

const cache = new Map<string, string>();

/**
 * A cached data URL of a portrait `size` px square (CSS pixels; drawn at 2x). Browser only. A mod's
 * portrait image for `crewId` or the outfit wins over the painted one (ADR 0313 point 1).
 */
export function portraitUrl(spec: CharacterSpec, size = 96, crewId?: string): string {
	const image = portraitImageOf(crewId, spec.outfit);
	if (image) return image;
	const look = spec.appearance ?? DEFAULT_APPEARANCE;
	const key = `${crewContentVersion()}|${spec.outfit}|${look.skin}|${look.hairStyle}|${look.hairColour}|${look.eyeColour}|${look.seed}|${spec.expression ?? 'happy'}|${spec.noHelmet ? 1 : 0}|${size}`;
	const hit = cache.get(key);
	if (hit) return hit;
	if (typeof document === 'undefined') return '';
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size * 2;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';
	paintPortrait(ctx, size * 2, spec);
	const url = canvas.toDataURL('image/png');
	cache.set(key, url);
	return url;
}
