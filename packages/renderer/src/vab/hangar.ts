/**
 * The assembly hangar of the VAB (plan 022): a tall steel hall with a lit assembly platform,
 * service towers with catwalks, an overhead crane, bay door, high windows with light shafts and
 * drifting dust. Everything is generated here (visual-direction: code first, assets later); the
 * textures are `DataTexture`s from the same seeded noise as the part materials, so building the
 * hangar needs no canvas and runs in Bun tests. `createHangar` returns the objects; lighting that
 * casts shadows belongs to the view, the lamps here are emissive and show up in the reflections
 * because the view bakes this very room into the environment map.
 */
import {
	AdditiveBlending,
	BoxGeometry,
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DataTexture,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	LinearFilter,
	LinearMipmapLinearFilter,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	NoColorSpace,
	Object3D,
	PlaneGeometry,
	Points,
	PointsMaterial,
	Quaternion,
	RGBAFormat,
	RepeatWrapping,
	RingGeometry,
	SRGBColorSpace,
	ShaderMaterial,
	UnsignedByteType,
	Vector3,
	type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3 } from '../noise.ts';
import { normalMapData, tileNoise } from '../parts/textures.ts';

/** Room half-extent on x and z, and height, metres. */
export const HANGAR = { half: 30, height: 46, platformRadius: 6.2 } as const;

/** Colours of the room. The accent is the UI accent (`--c-accent`), so the platform ring ties the scene to the panels. */
export const HANGAR_COLOURS = {
	steel: 0x3b4655,
	steelDark: 0x1d242d,
	concrete: 0x5b6169,
	yellow: 0xe3a61f,
	accent: 0x5ccfff,
	lampWarm: 0xfff0d8,
	window: 0xbfdcff,
	fog: 0x172029
} as const;

type Field = (u: number, v: number) => number;

function makeTexture(data: Uint8Array, size: number, colour: boolean, aniso = 8): DataTexture {
	const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
	t.wrapS = RepeatWrapping;
	t.wrapT = RepeatWrapping;
	t.magFilter = LinearFilter;
	t.minFilter = LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.anisotropy = aniso;
	t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
	t.needsUpdate = true;
	return t;
}

/** sRGB colour map from a function returning a 0..1 triple. */
export function colourMapData(
	size: number,
	field: (u: number, v: number) => readonly [number, number, number]
): Uint8Array {
	const out = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const [r, g, b] = field(x / size, y / size);
			const i = (y * size + x) * 4;
			out[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
			out[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
			out[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
			out[i + 3] = 255;
		}
	}
	return out;
}

const smooth = (e0: number, e1: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};
const lineDist = (t: number, n: number): number => {
	const f = (t * n) % 1;
	return Math.min(f, 1 - f) / n;
};

/** Poured concrete floor, one tile = 8 m: expansion joints every 4 m, mottling, stains. */
export const floorBrightness: Field = (u, v) => {
	const joint = 1 - smooth(0.0015, 0.0045, Math.min(lineDist(u, 2), lineDist(v, 2)));
	const mottle =
		tileNoise(u, v, 6, 51) * 0.5 + tileNoise(u, v, 24, 52) * 0.3 + tileNoise(u, v, 96, 53) * 0.2;
	const stain = smooth(0.62, 0.85, tileNoise(u, v, 3, 54));
	return 0.74 + mottle * 0.36 - joint * 0.22 - stain * 0.1;
};

/** Floor relief: only the joints and a little grain. */
const floorHeight: Field = (u, v) => {
	const joint = 1 - smooth(0.0015, 0.005, Math.min(lineDist(u, 2), lineDist(v, 2)));
	return -joint * 1.4 + tileNoise(u, v, 128, 55) * 0.25;
};

/** Corrugated wall cladding, one tile = 8 m: 1 m flutes, panel seams every 4 m wide and 2 m high. */
export const wallHeight: Field = (u, v) => {
	const flute = Math.sin(u * 8 * Math.PI * 2) * 0.35;
	const seamU = 1 - smooth(0.0015, 0.004, lineDist(u, 2));
	const seamV = 1 - smooth(0.001, 0.003, lineDist(v, 4));
	return flute - seamU * 0.9 - seamV * 0.7 + tileNoise(u, v, 64, 61) * 0.1;
};

export const wallBrightness: Field = (u, v) => {
	const seam = Math.max(
		1 - smooth(0.001, 0.005, lineDist(u, 2)),
		1 - smooth(0.001, 0.004, lineDist(v, 4))
	);
	const streak = tileNoise(u * 1, v * 0.15, 20, 62) * 0.5 + tileNoise(u, v, 8, 63) * 0.5;
	return 0.82 + streak * 0.2 - seam * 0.28;
};

/** Diamond plate for the platform and decks. One tile = 1 m. */
export const plateHeight: Field = (u, v) => {
	const a = (((u * 4 + v * 4) % 1) + 1) % 1;
	const b = (((u * 4 - v * 4) % 1) + 1) % 1;
	const da = Math.abs(a - 0.5);
	const db = Math.abs(b - 0.5);
	return (1 - smooth(0.12, 0.3, Math.max(da, db) * 0.6 + Math.min(da, db) * 0.4)) * 1.0;
};

/** Hazard stripes (yellow / near black), diagonal. */
export const hazard = (u: number, v: number): readonly [number, number, number] => {
	const k = ((((u + v) * 6) % 1) + 1) % 1 < 0.5 ? 1 : 0;
	const wear = 0.82 + tileNoise(u, v, 16, 71) * 0.18;
	return k ? [0.89 * wear, 0.65 * wear, 0.12 * wear] : [0.05, 0.055, 0.06];
};

export interface HangarTextures {
	floorMap: DataTexture;
	floorNormal: DataTexture;
	wallMap: DataTexture;
	wallNormal: DataTexture;
	plateNormal: DataTexture;
	hazardMap: DataTexture;
	dispose(): void;
}

export function createHangarTextures(size = 512): HangarTextures {
	const grey = (f: Field, tint: readonly [number, number, number]): Uint8Array =>
		colourMapData(size, (u, v) => {
			const b = f(u, v);
			return [b * tint[0], b * tint[1], b * tint[2]];
		});
	const t = {
		floorMap: makeTexture(grey(floorBrightness, [1.0, 1.02, 1.05]), size, true),
		floorNormal: makeTexture(normalMapData(size, floorHeight, 0.55), size, false),
		wallMap: makeTexture(grey(wallBrightness, [0.95, 1.0, 1.08]), size, true),
		wallNormal: makeTexture(normalMapData(size, wallHeight, 1.5), size, false),
		plateNormal: makeTexture(normalMapData(size, plateHeight, 1.8), size, false),
		hazardMap: makeTexture(colourMapData(size, hazard), size, true)
	};
	return {
		...t,
		dispose() {
			for (const tex of Object.values(t)) tex.dispose();
		}
	};
}

// --- geometry batching ----------------------------------------------------------------------------------

/** Collects transformed copies of geometries and merges them into one mesh per material. */
class Batch {
	private readonly parts: BufferGeometry[] = [];
	constructor(readonly material: Material) {}

	add(
		geometry: BufferGeometry,
		position: readonly [number, number, number],
		rotation?: { axis: readonly [number, number, number]; angle: number },
		scale?: readonly [number, number, number]
	): void {
		const m = new Matrix4().compose(
			new Vector3(...position),
			rotation
				? new Quaternion().setFromAxisAngle(
						new Vector3(...rotation.axis).normalize(),
						rotation.angle
					)
				: new Quaternion(),
			new Vector3(...(scale ?? [1, 1, 1]))
		);
		const g = geometry.clone().applyMatrix4(m);
		this.parts.push(g);
	}

	/** Axis aligned box centred at `c`. */
	box(c: readonly [number, number, number], size: readonly [number, number, number]): void {
		this.add(new BoxGeometry(...size), c);
	}

	/** A square beam from `a` to `b` of cross section `t`. */
	beam(
		a: readonly [number, number, number],
		b: readonly [number, number, number],
		t: number
	): void {
		const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		const len = d.length();
		const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
		const m = new Matrix4().compose(
			new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
			q,
			new Vector3(t, len, t)
		);
		this.parts.push(new BoxGeometry(1, 1, 1).applyMatrix4(m));
	}

	build(name: string, shadows = true): Mesh | null {
		if (this.parts.length === 0) return null;
		const merged = mergeGeometries(this.parts, false);
		for (const p of this.parts) p.dispose();
		const mesh = new Mesh(merged, this.material);
		mesh.name = name;
		mesh.castShadow = shadows;
		mesh.receiveShadow = true;
		return mesh;
	}
}

export interface Hangar {
	root: Group;
	/** World positions of the ceiling lamps, for the baked environment's own lights. */
	lamps: readonly (readonly [number, number, number])[];
	/** Objects whose draw order or visibility the view controls (the light shafts). */
	shafts: Object3D;
	update(dt: number, time: number): void;
	dispose(): void;
}

export interface HangarOptions {
	/** 0 = no dust, light shafts only; used by the low preset. */
	dust: number;
	textureSize?: number;
}

export function createHangar(options: HangarOptions = { dust: 400 }): Hangar {
	const C = HANGAR_COLOURS;
	const H = HANGAR.height;
	const W = HANGAR.half;
	const tex = createHangarTextures(options.textureSize ?? 512);
	const disposables: { dispose(): void }[] = [tex];
	const mat = <T extends Material>(m: T): T => {
		disposables.push(m);
		return m;
	};
	const geo = <T extends BufferGeometry>(g: T): T => {
		disposables.push(g);
		return g;
	};
	const root = new Group();
	root.name = 'hangar';

	// Materials. Repeat counts put one texture tile at 8 m (floor, walls) or 1 m (plate).
	const floorMat = mat(
		new MeshStandardMaterial({
			color: 0x6a717b,
			map: tex.floorMap,
			normalMap: tex.floorNormal,
			roughness: 0.5,
			metalness: 0.1,
			envMapIntensity: 1.0
		})
	);
	tex.floorMap.repeat.set((2 * W) / 8, (2 * W) / 8);
	tex.floorNormal.repeat.copy(tex.floorMap.repeat);
	const wallMat = mat(
		new MeshStandardMaterial({
			color: C.steel,
			map: tex.wallMap,
			normalMap: tex.wallNormal,
			roughness: 0.58,
			metalness: 0.5,
			envMapIntensity: 0.8
		})
	);
	tex.wallMap.repeat.set((2 * W) / 8, H / 8);
	tex.wallNormal.repeat.copy(tex.wallMap.repeat);
	const steel = mat(new MeshStandardMaterial({ color: 0x4a5565, roughness: 0.5, metalness: 0.7 }));
	const darkSteel = mat(
		new MeshStandardMaterial({ color: C.steelDark, roughness: 0.55, metalness: 0.6 })
	);
	const yellowPaint = mat(
		new MeshStandardMaterial({ color: C.yellow, roughness: 0.5, metalness: 0.2 })
	);
	const plateMat = mat(
		new MeshStandardMaterial({
			color: 0x2b333d,
			normalMap: tex.plateNormal,
			roughness: 0.4,
			metalness: 0.75
		})
	);
	tex.plateNormal.repeat.set(6, 6);
	const deckMat = mat(
		new MeshStandardMaterial({
			color: 0x5b6674,
			roughness: 0.5,
			metalness: 0.7,
			normalMap: tex.plateNormal
		})
	);
	const hazardMat = mat(
		new MeshStandardMaterial({
			color: 0xffffff,
			map: tex.hazardMap,
			roughness: 0.6,
			metalness: 0.1
		})
	);
	const ringMat = mat(
		new MeshStandardMaterial({
			color: 0x061018,
			emissive: new Color(C.accent),
			emissiveIntensity: 2.4,
			roughness: 0.5
		})
	);
	const lampMat = mat(
		new MeshStandardMaterial({
			color: 0x222222,
			emissive: new Color(C.lampWarm),
			emissiveIntensity: 7,
			roughness: 0.4
		})
	);
	const windowMat = mat(
		new MeshStandardMaterial({
			color: 0x0a1118,
			emissive: new Color(C.window),
			emissiveIntensity: 3.4,
			roughness: 0.3
		})
	);
	const doorGlowMat = mat(
		new MeshStandardMaterial({
			color: 0x201a10,
			emissive: new Color(0xffd9a0),
			emissiveIntensity: 4.5
		})
	);
	const crateMat = mat(
		new MeshStandardMaterial({ color: 0x3f5a44, roughness: 0.7, metalness: 0.2 })
	);
	const crateMat2 = mat(
		new MeshStandardMaterial({ color: 0x8c5a2e, roughness: 0.8, metalness: 0.05 })
	);
	const bottleMat = mat(
		new MeshStandardMaterial({ color: 0xb5382f, roughness: 0.45, metalness: 0.5 })
	);
	const signMat = mat(
		new MeshStandardMaterial({ color: 0x0c1218, roughness: 0.6, metalness: 0.4 })
	);

	// Floor and walls
	const floor = new Mesh(geo(new PlaneGeometry(2 * W, 2 * W)), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	floor.name = 'floor';
	root.add(floor);

	const wallGeo = geo(new PlaneGeometry(2 * W, H));
	for (const [x, z, ry] of [
		[0, -W, 0],
		[0, W, Math.PI],
		[-W, 0, Math.PI / 2],
		[W, 0, -Math.PI / 2]
	] as const) {
		const wall = new Mesh(wallGeo, wallMat);
		wall.position.set(x, H / 2, z);
		wall.rotation.y = ry;
		wall.receiveShadow = true;
		root.add(wall);
	}
	const ceiling = new Mesh(geo(new PlaneGeometry(2 * W, 2 * W)), darkSteel);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = H;
	root.add(ceiling);

	// Structure: columns, girts, trusses, windows, door
	const frame = new Batch(darkSteel);
	const trim = new Batch(steel);
	const windows = new Batch(windowMat);
	const doorGlow = new Batch(doorGlowMat);
	for (let i = -3; i <= 3; i++) {
		const p = i * 10;
		// Columns on the four walls, 1.2 m square, standing proud of the cladding.
		frame.box([p, H / 2, -W + 0.6], [1.2, H, 1.2]);
		frame.box([p, H / 2, W - 0.6], [1.2, H, 1.2]);
		frame.box([-W + 0.6, H / 2, p], [1.2, H, 1.2]);
		frame.box([W - 0.6, H / 2, p], [1.2, H, 1.2]);
		// Roof trusses across x, as lattice: chords plus diagonals.
		frame.box([p, H - 0.8, 0], [0.6, 0.6, 2 * W]);
	}
	for (const y of [10, 20, 30]) {
		frame.box([0, y, -W + 0.35], [2 * W, 0.5, 0.7]);
		frame.box([0, y, W - 0.35], [2 * W, 0.5, 0.7]);
		frame.box([-W + 0.35, y, 0], [0.7, 0.5, 2 * W]);
		frame.box([W - 0.35, y, 0], [0.7, 0.5, 2 * W]);
	}
	for (let k = -2; k <= 2; k++) frame.box([0, H - 1.6, k * 12], [2 * W, 1.0, 0.5]);
	for (let k = -2; k < 2; k++) {
		// Diagonals between two roof chords of the lattice.
		trim.beam([-W, H - 1.1, k * 12], [W, H - 2.1, k * 12 + 12], 0.18);
	}
	// High window band between the columns on all four walls.
	for (let i = -3; i < 3; i++) {
		const p = i * 10 + 5;
		for (const y of [33.5, 38.5]) {
			windows.box([p, y, -W + 0.12], [8.2, 4.2, 0.12]);
			windows.box([p, y, W - 0.12], [8.2, 4.2, 0.12]);
			windows.box([-W + 0.12, y, p], [0.12, 4.2, 8.2]);
			windows.box([W - 0.12, y, p], [0.12, 4.2, 8.2]);
		}
		// Mullions.
		for (const m of [-2.7, 0, 2.7]) {
			frame.box([p + m, 36, -W + 0.2], [0.18, 9.4, 0.3]);
			frame.box([p + m, 36, W - 0.2], [0.18, 9.4, 0.3]);
			frame.box([-W + 0.2, 36, p + m], [0.3, 9.4, 0.18]);
			frame.box([W - 0.2, 36, p + m], [0.3, 9.4, 0.18]);
		}
		frame.box([p, 36, -W + 0.2], [8.2, 0.2, 0.3]);
		frame.box([p, 36, W - 0.2], [8.2, 0.2, 0.3]);
		frame.box([-W + 0.2, 36, p], [0.3, 0.2, 8.2]);
		frame.box([W - 0.2, 36, p], [0.3, 0.2, 8.2]);
	}
	// Bay door on the back wall: frame, two leaves with ribs, and the bright gap between them.
	frame.box([0, 17.5, -W + 0.25], [17.2, 35, 0.5]);
	for (const s of [-1, 1]) {
		trim.box([s * 4.1, 16.4, -W + 0.45], [8.1, 32.4, 0.4]);
		for (let y = 2; y < 32; y += 2.4) frame.box([s * 4.1, y, -W + 0.7], [7.9, 0.22, 0.25]);
	}
	doorGlow.box([0, 16.4, -W + 0.85], [0.3, 32.4, 0.12]);

	// Accent strips: a cyan band along the foot of every wall and a lit stripe at mid height (the UI accent, as light).
	const strips = new Batch(ringMat);
	for (const y of [1.3, 19.6]) {
		strips.box([0, y, -W + 0.06], [2 * W, 0.16, 0.05]);
		strips.box([0, y, W - 0.06], [2 * W, 0.16, 0.05]);
		strips.box([-W + 0.06, y, 0], [0.05, 0.16, 2 * W]);
		strips.box([W - 0.06, y, 0], [0.05, 0.16, 2 * W]);
	}

	// Platform: raised steel disc, hazard ring, glowing accent ring, centre pattern
	const R = HANGAR.platformRadius;
	const platform = new Mesh(geo(new CylinderGeometry(R, R + 0.12, 0.3, 96)), plateMat);
	platform.position.y = 0.15;
	platform.receiveShadow = true;
	platform.castShadow = true;
	root.add(platform);
	const hazardRing = new Mesh(geo(new RingGeometry(R - 0.75, R - 0.05, 96, 1)), hazardMat);
	hazardRing.rotation.x = -Math.PI / 2;
	hazardRing.position.y = 0.302;
	hazardRing.receiveShadow = true;
	const ringUv = hazardRing.geometry.getAttribute('uv');
	const ringPos = hazardRing.geometry.getAttribute('position');
	for (let i = 0; i < ringUv.count; i++) {
		// Stripes run across the band: u follows the angle, v the radius.
		const a = Math.atan2(ringPos.getY(i), ringPos.getX(i));
		ringUv.setXY(i, (a / (Math.PI * 2)) * 24, Math.hypot(ringPos.getX(i), ringPos.getY(i)) * 0.7);
	}
	root.add(hazardRing);
	const glowRing = new Mesh(geo(new RingGeometry(R - 1.25, R - 1.1, 128, 1)), ringMat);
	glowRing.rotation.x = -Math.PI / 2;
	glowRing.position.y = 0.306;
	root.add(glowRing);
	const innerRing = new Mesh(geo(new RingGeometry(2.4, 2.46, 96, 1)), ringMat);
	innerRing.rotation.x = -Math.PI / 2;
	innerRing.position.y = 0.306;
	root.add(innerRing);
	const pad = new Mesh(geo(new CircleGeometry(2.4, 64)), darkSteel);
	pad.rotation.x = -Math.PI / 2;
	pad.position.y = 0.305;
	pad.receiveShadow = true;
	root.add(pad);
	// Spokes between the rings.
	const spokes = new Batch(ringMat);
	for (let k = 0; k < 8; k++) {
		const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
		spokes.add(new BoxGeometry(0.05, 0.004, 2.4), [Math.cos(a) * 3.6, 0.307, Math.sin(a) * 3.6], {
			axis: [0, 1, 0],
			angle: -a + Math.PI / 2
		});
	}
	const spokesMesh = spokes.build('spokes', false);
	if (spokesMesh) root.add(spokesMesh);

	// Service towers and catwalks
	const decks = new Batch(deckMat);
	const rails = new Batch(yellowPaint);
	const post = new Batch(steel);
	function tower(cx: number, cz: number, height: number, side: number): void {
		const half = 1.6;
		const levels = Math.floor(height / 3);
		for (const [sx, sz] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1]
		] as const) {
			post.box([cx + sx * half, height / 2, cz + sz * half], [0.34, height, 0.34]);
		}
		for (let l = 0; l <= levels; l++) {
			const y = l * 3;
			if (l > 0) {
				post.beam([cx - half, y, cz - half], [cx + half, y, cz - half], 0.16);
				post.beam([cx - half, y, cz + half], [cx + half, y, cz + half], 0.16);
				post.beam([cx - half, y, cz - half], [cx - half, y, cz + half], 0.16);
				post.beam([cx + half, y, cz - half], [cx + half, y, cz + half], 0.16);
			}
			if (l < levels) {
				const alt = l % 2 === 0 ? 1 : -1;
				post.beam([cx - half, y, cz - half], [cx + half * alt, y + 3, cz - half], 0.12);
				post.beam([cx - half, y, cz + half], [cx + half * alt, y + 3, cz + half], 0.12);
				post.beam([cx - half, y, cz - half], [cx - half, y + 3, cz + half * alt], 0.12);
				post.beam([cx + half, y, cz - half], [cx + half, y + 3, cz + half * alt], 0.12);
			}
		}
		// Working decks every 6 m with railings on three sides and a swing arm reaching towards the stack.
		for (let y = 6; y <= height - 3; y += 6) {
			decks.box([cx, y, cz], [3.9, 0.12, 3.9]);
			for (const [px, pz] of [
				[-1, -1],
				[1, -1],
				[-1, 1],
				[1, 1]
			] as const) {
				rails.box([cx + px * 1.9, y + 0.55, cz + pz * 1.9], [0.07, 1.1, 0.07]);
			}
			rails.beam([cx - 1.9, y + 1.05, cz - 1.9], [cx + 1.9, y + 1.05, cz - 1.9], 0.06);
			rails.beam([cx - 1.9, y + 1.05, cz + 1.9], [cx + 1.9, y + 1.05, cz + 1.9], 0.06);
			rails.beam(
				[cx + side * -1.9, y + 1.05, cz - 1.9],
				[cx + side * -1.9, y + 1.05, cz + 1.9],
				0.06
			);
			// Swing arm: a truss from the deck towards the vessel's axis, stopping 1.6 m short of it.
			const tip = side * 1.6;
			const x0 = cx + side * 1.9;
			post.beam([x0, y - 0.12, cz - 0.4], [tip, y - 0.12, cz - 0.4], 0.16);
			post.beam([x0, y - 0.12, cz + 0.4], [tip, y - 0.12, cz + 0.4], 0.16);
			post.beam([x0, y + 0.3, cz], [tip, y + 0.05, cz], 0.1);
			decks.box([(x0 + tip) / 2, y, cz], [Math.abs(x0 - tip), 0.1, 1.0]);
			rails.beam([x0, y + 1.0, cz - 0.55], [tip, y + 1.0, cz - 0.55], 0.05);
			rails.beam([x0, y + 1.0, cz + 0.55], [tip, y + 1.0, cz + 0.55], 0.05);
		}
	}
	tower(-9.5, -7, 30, 1);
	tower(9.5, -7, 26, -1);

	// Overhead crane: rails along z on both side walls, a bridge across, trolley, cables and hook.
	const crane = new Batch(yellowPaint);
	const craneRail = new Batch(darkSteel);
	craneRail.box([-W + 1.6, 36.6, 0], [0.5, 0.5, 2 * W - 3]);
	craneRail.box([W - 1.6, 36.6, 0], [0.5, 0.5, 2 * W - 3]);
	crane.box([0, 37.3, 8], [2 * W - 3, 1.1, 0.9]);
	crane.box([0, 37.3, 10], [2 * W - 3, 1.1, 0.9]);
	crane.box([-W + 1.6, 37.3, 9], [1.6, 1.1, 3.4]);
	crane.box([W - 1.6, 37.3, 9], [1.6, 1.1, 3.4]);
	craneRail.box([2.5, 36.4, 9], [2.2, 0.9, 2.4]);
	for (const dx of [-0.3, 0.3]) craneRail.box([2.5 + dx, 33, 9], [0.04, 7.6, 0.04]);
	craneRail.box([2.5, 29, 9], [0.7, 0.9, 0.7]);
	crane.box([2.5, 28.2, 9], [0.5, 0.35, 0.5]);

	// Props: crates, bottles, painted floor lines
	const crates = new Batch(crateMat);
	const crates2 = new Batch(crateMat2);
	const bottles = new Batch(bottleMat);
	for (const [x, z] of [
		[-24, -22],
		[-21.2, -23.2],
		[-23.6, -19.4]
	] as const) {
		crates.box([x, 0.6, z], [2.2, 1.2, 1.8]);
	}
	crates.box([-23, 1.8, -22], [1.6, 1.2, 1.4]);
	for (const [x, z] of [
		[22, -23],
		[24.4, -21.6],
		[22.6, -20]
	] as const) {
		crates2.box([x, 0.5, z], [1.8, 1.0, 1.8]);
	}
	crates2.box([22.6, 1.5, -22.4], [1.4, 1.0, 1.4]);
	for (let k = 0; k < 6; k++) {
		bottles.add(new CylinderGeometry(0.18, 0.18, 1.5, 14), [
			26 + (k % 3) * 0.5,
			0.75,
			-9 + Math.floor(k / 3) * 0.5
		]);
	}
	const lines = new Batch(yellowPaint);
	for (const s of [-1, 1]) {
		lines.box([s * 12.5, 0.012, 0], [0.16, 0.012, 25]);
		lines.box([0, 0.012, s * 12.5], [25, 0.012, 0.16]);
	}
	for (let k = -6; k <= 6; k++) lines.box([k * 4, 0.012, -27.5], [0.12, 0.012, 3]);

	// Ceiling lamps: housing plus emissive disc, hanging on two cables.
	const lamps: [number, number, number][] = [];
	const lampBatch = new Batch(lampMat);
	const lampHousing = new Batch(darkSteel);
	for (const x of [-18, -6, 6, 18]) {
		for (const z of [-20, -7, 7, 20]) {
			const y = H - 7;
			lamps.push([x, y, z]);
			lampBatch.add(new CylinderGeometry(1.3, 1.3, 0.12, 24), [x, y - 0.5, z]);
			lampHousing.add(new CylinderGeometry(1.5, 1.0, 0.8, 24), [x, y, z]);
			lampHousing.box([x, y + (H - y) / 2, z], [0.06, H - y, 0.06]);
		}
	}

	// Name sign above the bay door (a dark panel; the lettering is drawn by the view if a canvas exists).
	const sign = new Mesh(geo(new PlaneGeometry(13, 2.4)), signMat);
	sign.position.set(0, 38.6, -W + 0.55);
	sign.name = 'sign';
	root.add(sign);

	const lit = [
		frame,
		trim,
		decks,
		rails,
		post,
		crane,
		craneRail,
		crates,
		crates2,
		bottles,
		lines,
		lampHousing
	];
	const glowing = [windows, doorGlow, lampBatch, strips];
	for (const [list, shadows] of [
		[lit, true],
		[glowing, false]
	] as const) {
		for (const b of list) {
			const mesh = b.build('hangar-batch', shadows);
			if (mesh) {
				disposables.push(mesh.geometry);
				root.add(mesh);
			}
		}
	}

	// Light shafts from the high windows: additive cones fading along their length.
	const shafts = new Group();
	shafts.name = 'light-shafts';
	const shaftMat = mat(
		new ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			side: DoubleSide,
			uniforms: { uColor: { value: new Color(0xbfdcff) }, uStrength: { value: 0.07 } },
			vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ vT = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
			fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fade = smoothstep(0.0,0.25,vT) * (1.0 - smoothstep(0.55,1.0,vT)); gl_FragColor = vec4(uColor * uStrength * edge * fade, 1.0); }`
		})
	);
	const shaftGeo = geo(new CylinderGeometry(1.2, 4.2, 38, 24, 1, true));
	for (const [x, z, tx, tz] of [
		[-15, -29, -6, -8],
		[5, -29, 2, -10],
		[29, -5, 12, -4],
		[-29, 5, -13, 6]
	] as const) {
		const cone = new Mesh(shaftGeo, shaftMat);
		const top = new Vector3(x, 35, z);
		const bottom = new Vector3(tx, 0, tz);
		const dir = bottom.clone().sub(top);
		cone.position.copy(top).addScaledVector(dir, 0.5);
		cone.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir.clone().normalize());
		cone.scale.y = dir.length() / 38;
		cone.renderOrder = 4;
		shafts.add(cone);
	}
	root.add(shafts);

	// Dust motes drifting in the room.
	let dust: Points | null = null;
	let dustSeed: Float32Array | null = null;
	if (options.dust > 0) {
		const n = options.dust;
		const pos = new Float32Array(n * 3);
		dustSeed = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			pos[i * 3] = (hash3(i, 1, 0, 7) - 0.5) * 36;
			pos[i * 3 + 1] = 1 + hash3(i, 2, 0, 7) * 28;
			pos[i * 3 + 2] = (hash3(i, 3, 0, 7) - 0.5) * 36;
			dustSeed[i * 3] = hash3(i, 4, 0, 7) * 6.283;
			dustSeed[i * 3 + 1] = hash3(i, 5, 0, 7) * 6.283;
			dustSeed[i * 3 + 2] = 0.2 + hash3(i, 6, 0, 7) * 0.5;
		}
		const g = geo(new BufferGeometry());
		g.setAttribute('position', new Float32BufferAttribute(pos, 3));
		dust = new Points(
			g,
			mat(
				new PointsMaterial({
					color: 0xdfeaff,
					size: 0.045,
					transparent: true,
					opacity: 0.26,
					depthWrite: false,
					blending: AdditiveBlending,
					sizeAttenuation: true
				})
			)
		);
		dust.frustumCulled = false;
		root.add(dust);
	}
	const base = dust ? new Float32Array(dust.geometry.getAttribute('position').array) : null;

	return {
		root,
		lamps,
		shafts,
		update(_dt, time) {
			if (!dust || !base || !dustSeed) return;
			const attr = dust.geometry.getAttribute('position');
			for (let i = 0; i < attr.count; i++) {
				const s = dustSeed[i * 3 + 2]!;
				attr.setXYZ(
					i,
					base[i * 3]! + Math.sin(time * 0.1 * s + dustSeed[i * 3]!) * 1.2,
					base[i * 3 + 1]! + Math.sin(time * 0.07 * s + dustSeed[i * 3 + 1]!) * 0.9,
					base[i * 3 + 2]! + Math.cos(time * 0.09 * s + dustSeed[i * 3]!) * 1.2
				);
			}
			attr.needsUpdate = true;
		},
		dispose() {
			for (const d of disposables) d.dispose();
		}
	};
}
