/**
 * The crew character (plan 341, ADR 0291): the owner's chibi astronaut built from three geometry. A
 * rounded head (a super-ellipsoid with exact normals) with big eyes, brows and a mouth by expression,
 * tousled hair, a small body in an outfit, gloves, boots and hand props. Feet at y = 0, front +z,
 * the figure's left at +x; `CREW_HEIGHT` tall. Each piece hangs on one rigid bone (body, head, two
 * arms, two legs) and carries a colour role, so one builder serves the skinned walkers (vertex
 * colours, one material) and the EVA part (material slots).
 */
import {
	BoxGeometry,
	BufferGeometry,
	CapsuleGeometry,
	ConeGeometry,
	CylinderGeometry,
	Euler,
	Float32BufferAttribute,
	LatheGeometry,
	Matrix4,
	Quaternion,
	SphereGeometry,
	TorusGeometry,
	Vector2,
	Vector3
} from 'three';
import {
	DEFAULT_APPEARANCE,
	OUTFITS,
	SKINS,
	type Appearance,
	type CharacterSpec,
	type Expression,
	type Outfit
} from './outfits.ts';

export const BONES = ['root', 'body', 'head', 'armL', 'armR', 'legL', 'legR'] as const;
export type BoneName = (typeof BONES)[number];

/** Joint heights and offsets, metres from the feet. */
export const JOINTS = {
	hip: 0.5,
	neck: 0.95,
	shoulderY: 0.875,
	shoulderX: 0.205,
	legX: 0.095
} as const;

/** Each bone's pivot in the figure frame (the bind pose). */
export const PIVOTS: Readonly<Record<BoneName, readonly [number, number, number]>> = {
	root: [0, 0, 0],
	body: [0, JOINTS.hip, 0],
	head: [0, JOINTS.neck, 0],
	armL: [JOINTS.shoulderX, JOINTS.shoulderY, 0],
	armR: [-JOINTS.shoulderX, JOINTS.shoulderY, 0],
	legL: [JOINTS.legX, JOINTS.hip, 0],
	legR: [-JOINTS.legX, JOINTS.hip, 0]
};
export const PARENT: Readonly<Record<BoneName, BoneName | null>> = {
	root: null,
	body: 'root',
	head: 'body',
	armL: 'body',
	armR: 'body',
	legL: 'root',
	legR: 'root'
};

/** The head: a super-ellipsoid of half-extents A, B, C and exponent N around HEAD_Y. */
const HEAD = { y: 1.27, a: 0.29, b: 0.315, c: 0.255, n: 2.6 } as const;

export type Role =
	| 'skin'
	| 'hair'
	| 'eye'
	| 'pupil'
	| 'mouth'
	| 'tongue'
	| 'blush'
	| 'suit'
	| 'trim'
	| 'accent'
	| 'legs'
	| 'boots'
	| 'gloves'
	| 'hat'
	| 'dark'
	| 'metal'
	| 'pack'
	| 'lens'
	| 'paper';

export interface Piece {
	bone: BoneName;
	role: Role;
	/** Figure-frame geometry (bind pose) with position, normal and uv. */
	geometry: BufferGeometry;
	/** The EVA helmet: the part model's moving piece (hidden while the helmet is off). */
	helmet?: boolean;
}

/** The colour of a role for an outfit and a look, sRGB hex. */
export function roleColour(role: Role, outfit: Outfit, look: Appearance): number {
	switch (role) {
		case 'skin':
			return SKINS[look.skin];
		case 'hair':
			return look.hairColour;
		case 'eye':
			return 0xffffff;
		case 'pupil':
			return 0x2a1a14;
		case 'mouth':
			return 0x5a1e24;
		case 'tongue':
			return 0xe8747c;
		case 'blush':
			return 0xf29ab4;
		case 'suit':
			return outfit.suit;
		case 'trim':
			return outfit.trim;
		case 'accent':
			return outfit.accent;
		case 'legs':
			return outfit.legs;
		case 'boots':
			return outfit.boots;
		case 'gloves':
			return outfit.gloves === 0x8ec5f2 ? SKINS[look.skin] : outfit.gloves;
		case 'hat':
			return outfit.headwearColour;
		case 'dark':
			return 0x2b2e34;
		case 'metal':
			return 0xa9b0b9;
		case 'pack':
			return outfit.pack === 'eva' ? 0xe6e2da : 0x3a3f48;
		case 'lens':
			return 0x1b2a3c;
		case 'paper':
			return 0xf6f3ea;
	}
}

// --- shapes ----------------------------------------------------------------------------------------

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const Z = V(0, 0, 1);

const sgnPow = (v: number, p: number): number => Math.sign(v) * Math.abs(v) ** p;

/**
 * A super-ellipsoid |x/a|^n + |y/b|^n + |z/c|^n = 1 from a UV sphere's directions, with exact
 * normals (the gradient), so no seam shows. `theta` limits it from the top pole, `phi` around y.
 */
function superEllipsoid(
	a: number,
	b: number,
	c: number,
	n: number,
	w = 24,
	h = 16,
	theta: readonly [number, number] = [0, Math.PI],
	phi: readonly [number, number] = [0, Math.PI * 2]
): BufferGeometry {
	const g = new SphereGeometry(1, w, h, phi[0], phi[1], theta[0], theta[1]);
	const pos = g.getAttribute('position');
	const nor = g.getAttribute('normal');
	const p = V(0, 0, 0);
	for (let i = 0; i < pos.count; i++) {
		p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
		const s =
			(Math.abs(p.x / a) ** n + Math.abs(p.y / b) ** n + Math.abs(p.z / c) ** n) ** (-1 / n);
		const x = p.x * s;
		const y = p.y * s;
		const z = p.z * s;
		pos.setXYZ(i, x, y, z);
		const gx = sgnPow(x / a, n - 1) / a;
		const gy = sgnPow(y / b, n - 1) / b;
		const gz = sgnPow(z / c, n - 1) / c;
		const l = Math.hypot(gx, gy, gz) || 1;
		nor.setXYZ(i, gx / l, gy / l, gz / l);
	}
	return g;
}

const ellipsoid = (a: number, b: number, c: number, w = 10, h = 7): BufferGeometry =>
	new SphereGeometry(1, w, h).scale(a, b, c);

/** Places `g` at `at`, turned so its +z points along `dir` (then rolled by `roll` about it). */
function aim(g: BufferGeometry, at: Vector3, dir: Vector3, roll = 0): BufferGeometry {
	const q = new Quaternion().setFromUnitVectors(Z, dir.clone().normalize());
	if (roll) q.multiply(new Quaternion().setFromAxisAngle(Z, roll));
	return g.applyMatrix4(new Matrix4().compose(at, q, V(1, 1, 1)));
}

function put(
	g: BufferGeometry,
	at: readonly [number, number, number],
	rot: readonly [number, number, number] = [0, 0, 0]
): BufferGeometry {
	const m = new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2]));
	m.setPosition(at[0], at[1], at[2]);
	return g.applyMatrix4(m);
}

/** The head's front surface at (x, y) and its outward normal. */
export function headSurface(x: number, y: number): { point: Vector3; normal: Vector3 } {
	const { a, b, c, n } = HEAD;
	const dy = y - HEAD.y;
	const rest = Math.max(1 - Math.abs(x / a) ** n - Math.abs(dy / b) ** n, 1e-4);
	const z = c * rest ** (1 / n);
	const normal = V(sgnPow(x / a, n - 1) / a, sgnPow(dy / b, n - 1) / b, sgnPow(z / c, n - 1) / c);
	return { point: V(x, y, z), normal: normal.normalize() };
}

/** A face feature on the head surface at (x, y), pushed `out` metres along the normal. */
const onFace = (g: BufferGeometry, x: number, y: number, out: number, roll = 0): BufferGeometry => {
	const s = headSurface(x, y);
	return aim(g, s.point.addScaledVector(s.normal, out), s.normal, roll);
};

/** An arc (part of a torus) in the xy plane, centred, from angle `from` sweeping `arc`. */
const arcGeo = (r: number, tube: number, from: number, arc: number): BufferGeometry =>
	new TorusGeometry(r, tube, 5, 12, arc).rotateZ(from);

// --- the parts of the figure ------------------------------------------------------------------------

type Add = (bone: BoneName, role: Role, g: BufferGeometry, helmet?: boolean) => void;

function face(add: Add, expression: Expression, eyewear: Outfit['eyewear']): void {
	const ex = 0.112;
	const ey = 1.245;
	const open = (side: 1 | -1, scale = 1): void => {
		const x = side * ex;
		add('head', 'pupil', onFace(ellipsoid(0.06 * scale, 0.078 * scale, 0.028, 12, 8), x, ey, 0));
		add(
			'head',
			'eye',
			onFace(ellipsoid(0.02, 0.022, 0.01, 6, 4), x + side * 0.018, ey + 0.03, 0.024)
		);
		add(
			'head',
			'eye',
			onFace(ellipsoid(0.01, 0.011, 0.008, 6, 4), x - side * 0.022, ey - 0.03, 0.02)
		);
	};
	/** A closed eye: an arc, ∩ for a smiling squint, ∪ for sleep. */
	const closed = (side: 1 | -1, up: boolean): void => {
		const g = arcGeo(0.045, 0.011, up ? 0 : Math.PI, Math.PI);
		add('head', 'pupil', onFace(g, side * ex, ey + (up ? -0.015 : 0.02), 0.004));
	};
	const sunglasses = eyewear === 'sunglasses';
	switch (expression) {
		case 'wink':
			open(1);
			closed(-1, true);
			break;
		case 'sleepy':
			closed(1, false);
			closed(-1, false);
			break;
		case 'surprised':
			open(1, 1.1);
			open(-1, 1.1);
			break;
		case 'excited':
			open(1, 1.05);
			open(-1, 1.05);
			break;
		default:
			if (!sunglasses) {
				open(1);
				open(-1);
			}
	}
	// brows: tilt by expression (positive lifts the outer end on the figure's left)
	const tilt: Partial<Record<Expression, [number, number]>> = {
		angry: [0.45, 0.45],
		sad: [-0.4, -0.4],
		confused: [0.25, -0.15],
		surprised: [0, 0]
	};
	const [tl, tr] = tilt[expression] ?? [0.08, 0.08];
	const by = expression === 'surprised' ? 1.375 : expression === 'angry' ? 1.335 : 1.35;
	for (const [side, t] of [
		[1, tl],
		[-1, tr]
	] as const) {
		const brow = new CapsuleGeometry(0.011, 0.06, 3, 6).rotateZ(Math.PI / 2);
		add(
			'head',
			'hair',
			onFace(
				brow,
				side * ex,
				by + (expression === 'confused' && side === 1 ? 0.02 : 0),
				0.004,
				side * t
			)
		);
	}
	// cheeks
	for (const side of [1, -1]) {
		add('head', 'blush', onFace(ellipsoid(0.042, 0.024, 0.008, 8, 5), side * 0.182, 1.155, 0.0));
	}
	// mouth
	const my = 1.125;
	switch (expression) {
		case 'happy':
		case 'wink':
		case 'excited': {
			const big = expression === 'excited' ? 1.3 : 1;
			const m = superEllipsoid(0.06 * big, 0.05 * big, 0.018, 2.2, 14, 8, [
				Math.PI / 2,
				Math.PI / 2
			]);
			add('head', 'mouth', onFace(m, 0, my + 0.012, 0.002));
			add(
				'head',
				'tongue',
				onFace(ellipsoid(0.03 * big, 0.016 * big, 0.008, 8, 5), 0, my - 0.02 * big, 0.008)
			);
			break;
		}
		case 'surprised':
			add('head', 'mouth', onFace(ellipsoid(0.032, 0.042, 0.012), 0, my - 0.005, 0.003));
			break;
		case 'sleepy':
			add('head', 'mouth', onFace(ellipsoid(0.02, 0.024, 0.01), 0, my, 0.003));
			break;
		case 'confused': {
			const m = new CapsuleGeometry(0.01, 0.05, 3, 6).rotateZ(Math.PI / 2 + 0.25);
			add('head', 'mouth', onFace(m, 0.01, my, 0.004));
			break;
		}
		case 'sad':
		case 'angry':
			add('head', 'mouth', onFace(arcGeo(0.04, 0.011, 0, Math.PI), 0, my - 0.035, 0.004));
			break;
	}
}

/** Seeded random in [0, 1). */
const rng = (seed: number): (() => number) => {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
};

/** The hairline as a height on the unit head per front-back direction: high at the brow, low at the nape. */
const hairline = (dz: number): number => (dz > 0 ? 0.08 + 0.36 * dz : 0.08 + 0.62 * dz);

function hair(add: Add, look: Appearance, cover: 'none' | 'hat' | 'helmet'): void {
	const { a, b, c } = HEAD;
	// one shell over the crown down to the hairline, a little larger than the head
	const cap = superEllipsoid(a + 0.018, b + 0.02, c + 0.02, 2.6, 24, 16).toNonIndexed();
	keepTriangles(cap, (d) => d.y > hairline(d.z));
	add('head', 'hair', put(cap, [0, HEAD.y, -0.004]));
	const r = rng(look.seed);
	const tuft = (len: number, rad: number, at: Vector3, dir: Vector3): void => {
		const g = new ConeGeometry(rad, len, 8, 1).translate(0, len / 2, 0).rotateX(Math.PI / 2);
		add('head', 'hair', aim(g, at, dir));
	};
	const top = HEAD.y + b + 0.01;
	// fringe: tufts along the hairline over the brow and the temples, pointing forward and down
	const swept = look.hairStyle === 'swept' ? 0.6 : 0;
	const fringe = look.hairStyle === 'short' ? 5 : 7;
	for (let i = 0; i < fringe; i++) {
		const u = i / (fringe - 1) - 0.5;
		const ang = u * 2.3; // around the head from temple to temple
		const dz = Math.cos(ang);
		const dx = Math.sin(ang);
		const dy = hairline(dz) + 0.06;
		const dir = V(dx * a, dy * b, dz * c);
		const at = V(dir.x * 1.06, HEAD.y + dir.y * 1.04, dir.z * 1.06);
		const len = (look.hairStyle === 'short' ? 0.1 : 0.15) + r() * 0.04;
		tuft(len, 0.07, at, V(dx * 0.9 + swept, -0.85, dz * 0.7));
	}
	if (cover !== 'none') return;
	// the crown: spiky tufts up and out, as on the sheet
	const n = look.hairStyle === 'short' ? 4 : 7;
	const len = look.hairStyle === 'short' ? 0.08 : 0.12;
	for (let i = 0; i < n; i++) {
		const ang = (i / n) * Math.PI * 2 + r() * 0.6;
		const rr = 0.05 + r() * 0.12;
		const x = Math.cos(ang) * rr;
		const z = Math.sin(ang) * rr * 0.9 - 0.02;
		const lean = look.hairStyle === 'swept' ? V(0.5, 0.8, -0.3) : V(x * 2.2, 1, z * 2);
		tuft(len + r() * 0.04, 0.065, V(x, top - 0.03, z), lean);
	}
}

function headwear(add: Add, o: Outfit, noHelmet: boolean): void {
	const hy = HEAD.y;
	switch (o.headwear) {
		case 'helmet': {
			if (noHelmet) return;
			const r = 0.425;
			const cy = hy + 0.02;
			const open = (52 * Math.PI) / 180;
			const shell = new SphereGeometry(r, 22, 16).toNonIndexed();
			cutCap(shell, Math.cos(open));
			add('head', 'hat', put(shell, [0, cy, 0]), true);
			const rim = new TorusGeometry(r * Math.sin(open), 0.032, 6, 28);
			add('head', 'trim', put(rim, [0, cy, r * Math.cos(open)]), true);
			add(
				'head',
				'trim',
				put(new TorusGeometry(0.2, 0.04, 6, 20).rotateX(Math.PI / 2), [0, 0.95, 0]),
				true
			);
			add(
				'head',
				'metal',
				put(new CylinderGeometry(0.04, 0.045, 0.08, 10).rotateZ(Math.PI / 2), [
					0.41,
					cy + 0.12,
					0.08
				]),
				true
			);
			add(
				'head',
				'lens',
				put(new CylinderGeometry(0.03, 0.03, 0.01, 10).rotateX(Math.PI / 2), [
					0.41,
					cy + 0.12,
					0.125
				]),
				true
			);
			add(
				'head',
				'accent',
				put(new TorusGeometry(r * 0.99, 0.012, 4, 30, Math.PI).rotateY(Math.PI / 2), [0, cy, 0]),
				true
			);
			return;
		}
		case 'hard-hat': {
			add(
				'head',
				'hat',
				put(superEllipsoid(0.32, 0.2, 0.3, 2.4, 20, 8, [0, Math.PI / 2]), [0, hy + 0.17, 0])
			);
			add(
				'head',
				'hat',
				put(new CylinderGeometry(0.37, 0.37, 0.022, 24).scale(1, 1, 0.95), [0, hy + 0.17, 0.02])
			);
			add('head', 'hat', put(new BoxGeometry(0.05, 0.07, 0.5), [0, hy + 0.36, 0]));
			add(
				'head',
				'accent',
				put(new CylinderGeometry(0.035, 0.035, 0.012, 12).rotateX(Math.PI / 2), [
					0,
					hy + 0.27,
					0.27
				])
			);
			return;
		}
		case 'cap': {
			add(
				'head',
				'hat',
				put(superEllipsoid(0.305, 0.17, 0.285, 2.4, 20, 8, [0, Math.PI / 2]), [0, hy + 0.2, -0.005])
			);
			add('head', 'hat', put(superEllipsoid(0.17, 0.016, 0.14, 2.2, 14, 6), [0, hy + 0.2, 0.3]));
			add('head', 'hat', put(new SphereGeometry(0.025, 8, 6), [0, hy + 0.37, 0]));
			add('head', 'accent', put(ellipsoid(0.05, 0.035, 0.01), [0, hy + 0.28, 0.25], [-0.6, 0, 0]));
			return;
		}
		case 'headset': {
			add(
				'head',
				'hat',
				put(new TorusGeometry(0.31, 0.022, 6, 20, Math.PI), [0, hy + 0.02, -0.01])
			);
			for (const side of [1, -1]) {
				add(
					'head',
					'hat',
					put(new CylinderGeometry(0.075, 0.075, 0.07, 14).rotateZ(Math.PI / 2), [
						side * 0.3,
						hy - 0.02,
						0
					])
				);
				add(
					'head',
					'accent',
					put(new CylinderGeometry(0.04, 0.04, 0.072, 10).rotateZ(Math.PI / 2), [
						side * 0.302,
						hy - 0.02,
						0
					])
				);
			}
			const boom = new CylinderGeometry(0.009, 0.009, 0.24, 6).rotateX(Math.PI / 2);
			add('head', 'hat', put(boom, [0.25, hy - 0.11, 0.13], [0, -0.55, 0]));
			add('head', 'hat', put(new SphereGeometry(0.022, 8, 6), [0.17, hy - 0.13, 0.24]));
			return;
		}
		case 'goggles':
		case 'pilot-goggles': {
			const y = hy + 0.17;
			add(
				'head',
				'hat',
				put(superEllipsoid(HEAD.a + 0.012, 0.03, HEAD.c + 0.03, 2.6, 22, 4), [0, y, -0.01])
			);
			for (const side of [1, -1]) {
				const s = headSurface(side * 0.1, y);
				add(
					'head',
					'metal',
					aim(
						new CylinderGeometry(0.065, 0.07, 0.05, 14).rotateX(Math.PI / 2),
						s.point.addScaledVector(s.normal, 0.03),
						s.normal
					)
				);
				add(
					'head',
					'lens',
					aim(
						new CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2),
						s.point.addScaledVector(s.normal, 0.058),
						s.normal
					)
				);
			}
			return;
		}
		case 'none':
			return;
	}
}

function eyewear(add: Add, o: Outfit): void {
	if (o.eyewear === 'none') return;
	const ey = 1.245;
	for (const side of [1, -1]) {
		const s = headSurface(side * 0.112, ey);
		const at = s.point.addScaledVector(s.normal, 0.035);
		if (o.eyewear === 'glasses')
			add('head', 'dark', aim(new TorusGeometry(0.075, 0.011, 5, 20), at, s.normal));
		else add('head', 'lens', aim(ellipsoid(0.075, 0.06, 0.015, 14, 8), at, s.normal));
		// arm back to the ear
		add('head', 'dark', put(new BoxGeometry(0.01, 0.012, 0.2), [side * 0.255, ey + 0.02, 0.1]));
	}
	add(
		'head',
		'dark',
		put(new CylinderGeometry(0.008, 0.008, 0.06, 5).rotateZ(Math.PI / 2), [
			0,
			ey + 0.02,
			HEAD.c + 0.035
		])
	);
}

/** Removes the triangles of a unit-normal sphere geometry whose centre direction has z above `cos`. */
function cutCap(g: BufferGeometry, cos: number): void {
	keepTriangles(g, (d) => d.z <= cos);
}

/** Keeps the triangles of a non-indexed geometry around the origin whose centre direction passes `keep`. */
function keepTriangles(g: BufferGeometry, test: (dir: Vector3) => boolean): void {
	const pos = g.getAttribute('position');
	const keep: number[] = [];
	const a = V(0, 0, 0);
	for (let t = 0; t < pos.count; t += 3) {
		a.set(0, 0, 0);
		for (let k = 0; k < 3; k++) a.add(V(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)));
		if (test(a.normalize())) keep.push(t);
	}
	for (const name of Object.keys(g.attributes)) {
		const attr = g.getAttribute(name);
		const size = attr.itemSize;
		const out = new Float32Array(keep.length * 3 * size);
		keep.forEach((t, i) => {
			for (let k = 0; k < 3 * size; k++) out[i * 3 * size + k] = attr.array[t * size + k]!;
		});
		g.setAttribute(name, new Float32BufferAttribute(out, size));
	}
}

function body(add: Add, o: Outfit): void {
	const coat = o.body === 'coat';
	const shirt = o.body === 'shirt';
	// torso: a lathe, flattened front to back
	const prof = coat
		? [
				[0, 0.3],
				[0.25, 0.3],
				[0.235, 0.42],
				[0.215, 0.6],
				[0.215, 0.8],
				[0.19, 0.92],
				[0.12, 0.965],
				[0, 0.97]
			]
		: [
				[0, 0.44],
				[0.175, 0.44],
				[0.205, 0.5],
				[0.215, 0.62],
				[0.214, 0.8],
				[0.19, 0.92],
				[0.12, 0.965],
				[0, 0.97]
			];
	const torso = new LatheGeometry(
		prof.map(([r, y]) => new Vector2(r, y)),
		20
	).scale(1, 1, 0.8);
	add('body', 'suit', torso);
	add(
		'body',
		'trim',
		put(new TorusGeometry(0.13, 0.035, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.85), [0, 0.95, 0])
	);
	const front = 0.172;
	if (o.body === 'suit') {
		add(
			'body',
			'dark',
			put(new CylinderGeometry(0.218, 0.218, 0.05, 20).scale(1, 1, 0.8), [0, 0.56, 0])
		);
		add('body', 'metal', put(new BoxGeometry(0.07, 0.05, 0.02), [0, 0.56, 0.178]));
		// the chest patch on the left, a name strip on the right
		add(
			'body',
			'accent',
			put(new CylinderGeometry(0.045, 0.045, 0.012, 16).rotateX(Math.PI / 2), [
				0.1,
				0.8,
				front + 0.002
			])
		);
		add('body', 'trim', put(new BoxGeometry(0.08, 0.025, 0.01), [-0.1, 0.8, front]));
		if (o.harness) {
			for (const side of [1, -1]) {
				add(
					'body',
					'dark',
					put(
						new BoxGeometry(0.04, 0.36, 0.015),
						[side * 0.075, 0.76, front + 0.002],
						[0, 0, side * 0.08]
					)
				);
			}
			add('body', 'dark', put(new BoxGeometry(0.26, 0.035, 0.015), [0, 0.7, front + 0.004]));
			add('body', 'metal', put(new BoxGeometry(0.045, 0.045, 0.016), [0, 0.7, front + 0.008]));
		}
	}
	if (coat) {
		add('body', 'trim', put(new BoxGeometry(0.012, 0.56, 0.01), [0, 0.6, 0.176]));
		for (const side of [1, -1]) {
			add(
				'body',
				'trim',
				put(new BoxGeometry(0.06, 0.18, 0.012), [side * 0.07, 0.87, 0.16], [0, 0, side * 0.35])
			);
			add('body', 'trim', put(new BoxGeometry(0.09, 0.07, 0.01), [side * 0.13, 0.5, 0.185]));
		}
		add('body', 'accent', put(new BoxGeometry(0.03, 0.06, 0.01), [0.12, 0.82, 0.172]));
		if (o.tie !== undefined) {
			add('body', 'legs', put(new BoxGeometry(0.11, 0.12, 0.01), [0, 0.89, 0.15]));
			add('body', 'accent', put(new BoxGeometry(0.035, 0.18, 0.012), [0, 0.8, 0.168]));
		}
		if (o.stethoscope) {
			add(
				'body',
				'dark',
				put(
					new TorusGeometry(0.15, 0.011, 4, 18, Math.PI * 1.2)
						.rotateX(Math.PI / 2 + 0.5)
						.rotateY(Math.PI * -0.1),
					[0, 0.9, 0.04]
				)
			);
			add(
				'body',
				'metal',
				put(new CylinderGeometry(0.03, 0.03, 0.015, 12).rotateX(Math.PI / 2), [0.06, 0.74, 0.185])
			);
		}
	}
	if (shirt) {
		const r = rng(7);
		for (let i = 0; i < 9; i++) {
			const ang = -0.9 + r() * 1.8;
			const y = 0.5 + r() * 0.4;
			add(
				'body',
				'accent',
				put(
					ellipsoid(0.03, 0.03, 0.006),
					[Math.sin(ang) * 0.2, y, Math.cos(ang) * 0.165 + 0.005],
					[0, ang, 0]
				)
			);
		}
		// a camera strap across the chest
		add('body', 'dark', put(new BoxGeometry(0.025, 0.5, 0.012), [0, 0.72, 0.17], [0, 0, 0.7]));
	}
	if (o.pack !== 'none') {
		const eva = o.pack === 'eva';
		const [a, b, c] = eva ? [0.23, 0.27, 0.1] : [0.15, 0.18, 0.06];
		const back = -0.17 - c + 0.02;
		add('body', 'pack', put(superEllipsoid(a, b, c, 4, 14, 10), [0, 0.74, back]));
		if (eva) {
			add('body', 'accent', put(new BoxGeometry(0.3, 0.03, 0.02), [0, 0.86, back - c + 0.005]));
			add(
				'body',
				'dark',
				put(new CylinderGeometry(0.05, 0.05, 0.02, 14).rotateX(Math.PI / 2), [0, 0.68, back - c])
			);
			for (const side of [1, -1]) {
				add('body', 'trim', put(new BoxGeometry(0.04, 0.22, 0.04), [side * 0.25, 0.74, back]));
			}
		}
	}
}

function arms(add: Add, o: Outfit, prop: Outfit['prop']): void {
	const short = o.body === 'shirt';
	for (const [bone, side] of [
		['armL', 1],
		['armR', -1]
	] as const) {
		const sx = side * JOINTS.shoulderX;
		const out = side * 0.06;
		const sleeve = new CapsuleGeometry(0.068, 0.2, 4, 10);
		add(
			bone,
			o.body === 'coat' ? 'suit' : 'suit',
			put(sleeve, [sx + out * 0.5, 0.75, 0], [0, 0, side * 0.12])
		);
		if (short)
			add(
				bone,
				'skin',
				put(new CapsuleGeometry(0.055, 0.12, 3, 8), [sx + out, 0.64, 0], [0, 0, side * 0.12])
			);
		add(
			bone,
			'trim',
			put(
				new TorusGeometry(0.06, 0.02, 5, 14).rotateX(Math.PI / 2),
				[sx + out * 1.05, 0.62, 0],
				[0, 0, side * 0.12]
			)
		);
		add(bone, 'gloves', put(ellipsoid(0.075, 0.08, 0.07), [sx + out * 1.2, 0.55, 0.01]));
		add(
			bone,
			'gloves',
			put(ellipsoid(0.025, 0.04, 0.025, 8, 6), [sx + out * 1.2 - side * 0.055, 0.57, 0.04])
		);
	}
	const hx = -JOINTS.shoulderX - 0.072;
	switch (prop) {
		case 'wrench':
			add('armR', 'metal', put(new BoxGeometry(0.028, 0.24, 0.014), [hx, 0.44, 0.04]));
			add(
				'armR',
				'metal',
				put(new TorusGeometry(0.035, 0.014, 5, 12, Math.PI * 1.5).rotateZ(-Math.PI / 4), [
					hx,
					0.32,
					0.04
				])
			);
			add('armR', 'metal', put(new TorusGeometry(0.03, 0.012, 5, 12), [hx, 0.56, 0.04]));
			break;
		case 'tablet':
			add(
				'armR',
				'dark',
				put(new BoxGeometry(0.2, 0.26, 0.016), [hx + 0.06, 0.5, 0.11], [-0.25, 0.6, 0])
			);
			add(
				'armR',
				'lens',
				put(new BoxGeometry(0.17, 0.22, 0.004), [hx + 0.065, 0.502, 0.121], [-0.25, 0.6, 0])
			);
			break;
		case 'clipboard':
			add(
				'armR',
				'hat',
				put(new BoxGeometry(0.18, 0.24, 0.012), [hx + 0.05, 0.5, 0.1], [-0.25, 0.6, 0])
			);
			add(
				'armR',
				'paper',
				put(new BoxGeometry(0.15, 0.19, 0.004), [hx + 0.054, 0.49, 0.108], [-0.25, 0.6, 0])
			);
			add(
				'armR',
				'metal',
				put(new BoxGeometry(0.07, 0.025, 0.016), [hx + 0.046, 0.61, 0.11], [-0.25, 0.6, 0])
			);
			break;
		case 'camera':
			add('armR', 'dark', put(new BoxGeometry(0.13, 0.08, 0.07), [hx + 0.02, 0.52, 0.09]));
			add(
				'armR',
				'lens',
				put(new CylinderGeometry(0.03, 0.032, 0.05, 12).rotateX(Math.PI / 2), [
					hx + 0.03,
					0.52,
					0.14
				])
			);
			break;
		case 'none':
			break;
	}
}

function legs(add: Add, o: Outfit): void {
	const shorts = o.body === 'shirt';
	for (const [bone, side] of [
		['legL', 1],
		['legR', -1]
	] as const) {
		const x = side * JOINTS.legX;
		if (shorts) {
			add(bone, 'legs', put(new CapsuleGeometry(0.095, 0.12, 4, 10), [x, 0.4, 0]));
			add(bone, 'skin', put(new CapsuleGeometry(0.06, 0.16, 3, 8), [x, 0.22, 0]));
		} else {
			add(bone, 'legs', put(new CapsuleGeometry(0.085, 0.26, 4, 10), [x, 0.33, 0]));
		}
		add(bone, 'boots', put(superEllipsoid(0.095, 0.075, 0.135, 3, 12, 8), [x, 0.08, 0.025]));
		add(bone, 'dark', put(superEllipsoid(0.1, 0.02, 0.14, 3, 12, 4), [x, 0.018, 0.025]));
		if (o.body === 'suit')
			add(
				bone,
				'trim',
				put(new TorusGeometry(0.083, 0.018, 5, 14).rotateX(Math.PI / 2), [x, 0.16, 0])
			);
	}
	// hips: a short bridge between the legs, on the body
	add(
		'body',
		o.body === 'coat' ? 'legs' : 'legs',
		put(
			new CapsuleGeometry(0.11, 0.1, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.9, 0.85),
			[0, 0.49, 0]
		)
	);
}

/** Every piece of a figure, in the figure frame, bind pose. */
export function buildCharacter(spec: CharacterSpec): Piece[] {
	const o = OUTFITS[spec.outfit];
	const look = spec.appearance ?? DEFAULT_APPEARANCE;
	const expression = spec.expression ?? 'happy';
	const pieces: Piece[] = [];
	const add: Add = (bone, role, geometry, helmet) => {
		for (const name of Object.keys(geometry.attributes)) {
			if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
		}
		const g = geometry.index ? geometry.toNonIndexed() : geometry;
		if (g !== geometry) geometry.dispose();
		pieces.push({ bone, role, geometry: g, ...(helmet ? { helmet } : {}) });
	};
	add('head', 'skin', put(superEllipsoid(HEAD.a, HEAD.b, HEAD.c, HEAD.n, 24, 16), [0, HEAD.y, 0]));
	// small ears
	for (const side of [1, -1])
		add(
			'head',
			'skin',
			put(ellipsoid(0.04, 0.06, 0.035, 10, 8), [side * (HEAD.a - 0.005), HEAD.y - 0.02, -0.01])
		);
	face(add, expression, o.eyewear);
	const cover =
		o.headwear === 'helmet' && !spec.noHelmet
			? 'helmet'
			: o.headwear === 'hard-hat' || o.headwear === 'cap'
				? 'hat'
				: 'none';
	hair(add, look, cover === 'helmet' ? 'helmet' : cover);
	headwear(add, o, spec.noHelmet ?? false);
	eyewear(add, o);
	body(add, o);
	arms(add, o, spec.prop ?? o.prop);
	legs(add, o);
	return pieces;
}

/** The figure's bounding box height of a set of pieces, metres (bind pose). */
export function piecesHeight(pieces: readonly Piece[]): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;
	for (const p of pieces) {
		p.geometry.computeBoundingBox();
		const b = p.geometry.boundingBox!;
		min = Math.min(min, b.min.y);
		max = Math.max(max, b.max.y);
	}
	return { min, max };
}
