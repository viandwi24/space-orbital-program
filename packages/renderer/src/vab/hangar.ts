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
	SpotLight,
	ClampToEdgeWrapping,
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
import { DEFAULT_TIME_OF_DAY, dayLight, floorPatch, type DayLight } from './hangar-light.ts';
import {
	CREW,
	REST_TIME,
	LANE,
	createCrane,
	createCrew,
	createMoverMaterials,
	createTug,
	cranePose,
	poseCrane,
	poseTug
} from './hangar-movers.ts';
import { SAFETY_CELLS, SIGN_ATLAS, numberCell, type SignCell } from './hangar-signs.ts';

/**
 * The building as authored, metres: walls at ±30, roof at 46. The shell is built at this size and
 * scaled by `HANGAR_SCALE` (owner, 2026-10-21: Kronos V, 46 m, reached the roof).
 */
const AUTHORED = { half: 30, height: 46 } as const;
/**
 * How much bigger the built shell is than authored (walls, roof, trusses, crane, towers, lamps).
 * The platform, the walking crew and the tug keep their size: they are human scale.
 */
export const HANGAR_SCALE = 1.5;
/** Room half-extent on x and z, and height, metres, as the player sees it (90 × 90 × 69 m). */
export const HANGAR = {
	half: AUTHORED.half * HANGAR_SCALE,
	height: AUTHORED.height * HANGAR_SCALE,
	platformRadius: 6.2
} as const;

/**
 * The service towers (plan 220): bases well back from the platform, the left one taller. Since plan
 * 255 their arms stay retracted: a stub of `ARM_STUB` past each deck, so the whole middle of the
 * bay is free whatever the vessel's size.
 */
export const TOWERS = [
	{ x: -15, z: -13, height: 30 },
	{ x: 15, z: -13, height: 26 }
] as const;
/** How far a retracted arm reaches past its tower's deck edge, m (plan 255). */
export const ARM_STUB = 1.2;

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

/** Panel (4 m wide, 2 m high) a texel belongs to; every panel is a little lighter or darker and tinted differently. */
const panelOf = (u: number, v: number): readonly [number, number] => [
	hash3(Math.floor(u * 2), Math.floor(v * 4), 0, 64) - 0.5,
	hash3(Math.floor(u * 2), Math.floor(v * 4), 1, 66) - 0.5
];

export const wallBrightness: Field = (u, v) => {
	const seam = Math.max(
		1 - smooth(0.001, 0.005, lineDist(u, 2)),
		1 - smooth(0.001, 0.004, lineDist(v, 4))
	);
	const streak = tileNoise(u * 1, v * 0.15, 20, 62) * 0.5 + tileNoise(u, v, 8, 63) * 0.5;
	const [panel] = panelOf(u, v);
	// Run-off below the horizontal seams, in columns picked by noise: the wear of a hall that is used.
	const below = 1 - ((((v * 4) % 1) + 1) % 1);
	const drip = smooth(0.62, 0.8, tileNoise(u, 0.3, 36, 65)) * below * below;
	return 0.82 + streak * 0.2 + panel * 0.2 - seam * 0.28 - drip * 0.12;
};

/** Wall colour: the brightness above with a slight warm/cool tint per panel. */
export const wallColour = (u: number, v: number): readonly [number, number, number] => {
	const b = wallBrightness(u, v);
	const [, tint] = panelOf(u, v);
	return [b * (0.97 + tint * 0.1), b * 1.0, b * (1.07 - tint * 0.1)];
};

/** Sky seen through a window, 0..1 in v from the sill to the head: pale haze at the horizon, blue above, soft clouds. */
export const skyColour = (u: number, v: number): readonly [number, number, number] => {
	const h = smooth(0.0, 1.0, v);
	const cloud = smooth(0.55, 0.85, tileNoise(u, v, 3, 81)) * 0.35 * (1 - h * 0.5);
	return [
		0.62 + 0.3 * (1 - h) + cloud * 0.4,
		0.8 + 0.18 * (1 - h) + cloud * 0.3,
		1.0 - cloud * 0.05
	];
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
	skyMap: DataTexture;
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
		wallMap: makeTexture(colourMapData(size, wallColour), size, true),
		skyMap: makeTexture(colourMapData(Math.min(size, 128), skyColour), Math.min(size, 128), true),
		wallNormal: makeTexture(normalMapData(size, wallHeight, 1.5), size, false),
		plateNormal: makeTexture(normalMapData(size, plateHeight, 1.8), size, false),
		hazardMap: makeTexture(colourMapData(size, hazard), size, true)
	};
	t.skyMap.wrapS = ClampToEdgeWrapping;
	t.skyMap.wrapT = ClampToEdgeWrapping;
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

	/** A round pipe from `a` to `b`. */
	pipe(
		a: readonly [number, number, number],
		b: readonly [number, number, number],
		radius: number
	): void {
		const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
		const m = new Matrix4().compose(
			new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
			q,
			new Vector3(1, 1, 1)
		);
		this.parts.push(new CylinderGeometry(radius, radius, d.length(), 10, 1).applyMatrix4(m));
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
	/** The sun shafts and their floor patches (empty in the low variant); the view controls visibility. */
	shafts: Object3D;
	/**
	 * Real lights of the `high` variant: floodlights on the service towers aimed at the vessel. The
	 * view adds them to the scene (not to the baked environment); empty for `low`.
	 */
	workLights: SpotLight[];
	/** The sun of this hangar's time of day; the view tints its key light with `warmth`. */
	daylight: DayLight;
	/**
	 * The widest horizontal reach of the vessel from the platform axis, m, or null for none (plan
	 * 220); the swing arms no longer follow it (plan 255).
	 */
	setVesselRadius(radius: number | null): void;
	/** Crane, tug and crew freeze at the rest pose (true) or move again (false). */
	setReducedMotion(on: boolean): void;
	update(dt: number, time: number): void;
	dispose(): void;
}

export interface HangarOptions {
	/** 0 = no dust, light shafts only; used by the low preset. */
	dust: number;
	textureSize?: number;
	/** `high`: work lights, daylight shafts and floor patches. `low`: the cheap static variant. Default `high`. */
	quality?: 'low' | 'high';
	/** 0 = dawn, 1 = dusk; default a fixed afternoon (`DEFAULT_TIME_OF_DAY`). */
	timeOfDay?: number;
	/** The crane, tug and crew stand still. */
	reducedMotion?: boolean;
}

/** The four walls as [x, z, rotation about y]; a plane faces +z at rotation 0, so each faces into the room. */
const WALLS = [
	[0, -AUTHORED.half, 0],
	[0, AUTHORED.half, Math.PI],
	[-AUTHORED.half, 0, Math.PI / 2],
	[AUTHORED.half, 0, -Math.PI / 2]
] as const;

/**
 * A strip across all four walls between heights `y0` and `y1`, `offset` metres in front of the
 * cladding, merged into one geometry. `uv(along, y)` maps metres along the wall and height to texture
 * coordinates, so every band picks its own tiling.
 */
export function wallStrip(
	y0: number,
	y1: number,
	offset: number,
	uv: (along: number, y: number) => readonly [number, number]
): BufferGeometry {
	const W = AUTHORED.half;
	const parts = WALLS.map(([x, z, ry]) => {
		const g = new PlaneGeometry(2 * W, y1 - y0);
		const pos = g.getAttribute('position');
		const uvs = g.getAttribute('uv');
		for (let i = 0; i < pos.count; i++) {
			const [u, v] = uv(pos.getX(i) + W, pos.getY(i) + (y0 + y1) / 2);
			uvs.setXY(i, u, v);
		}
		g.rotateY(ry);
		g.translate(x + Math.sin(ry) * offset, (y0 + y1) / 2, z + Math.cos(ry) * offset);
		return g;
	});
	const merged = mergeGeometries(parts, false);
	for (const g of parts) g.dispose();
	if (!merged) throw new Error('Hangar wall strip could not be merged');
	return merged;
}

/** A flat plate on a column face: `wall` indexes `WALLS`, `along` is metres along it from the room centre. */
function plateGeometry(
	wall: number,
	along: number,
	y: number,
	w: number,
	h: number,
	cell: SignCell
): BufferGeometry {
	const [x, z, ry] = WALLS[wall]!;
	const g = new PlaneGeometry(w, h);
	const pos = g.getAttribute('position');
	const uvs = g.getAttribute('uv');
	const { width, height } = SIGN_ATLAS;
	for (let i = 0; i < pos.count; i++) {
		uvs.setXY(
			i,
			(pos.getX(i) > 0 ? cell.x + cell.w : cell.x) / width,
			1 - (pos.getY(i) > 0 ? cell.y : cell.y + cell.h) / height
		);
	}
	g.rotateY(ry);
	// Along-wall direction for rotation ry is (cos ry, 0, -sin ry); the column face stands 1.2 m off the cladding.
	const inward = AUTHORED.half - 1.2 - 0.015;
	g.translate(
		(x === 0 ? 0 : Math.sign(x) * inward) + Math.cos(ry) * along,
		y,
		(z === 0 ? 0 : Math.sign(z) * inward) - Math.sin(ry) * along
	);
	return g;
}

export function createHangar(options: HangarOptions = { dust: 400 }): Hangar {
	const C = HANGAR_COLOURS;
	const H = AUTHORED.height;
	const W = AUTHORED.half;
	const high = (options.quality ?? 'high') === 'high';
	let reduced = options.reducedMotion === true;
	const daylight = dayLight(options.timeOfDay ?? DEFAULT_TIME_OF_DAY);
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
	/** A texture sharing the image of `t` with its own 1:1 repeat, for bands that set their uv in metres. */
	const unit = (t: DataTexture): DataTexture => {
		const c = t.clone();
		c.repeat.set(1, 1);
		c.needsUpdate = true;
		disposables.push(c);
		return c;
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
	// The cladding above the paint band is lighter, so the wall reads as three zones, not one dark sheet.
	const wallLightMat = mat(
		new MeshStandardMaterial({
			color: 0x77849a,
			map: tex.wallMap,
			normalMap: tex.wallNormal,
			roughness: 0.52,
			metalness: 0.45,
			envMapIntensity: 0.9
		})
	);
	const wainscotMat = mat(
		new MeshStandardMaterial({
			color: 0x3d5266,
			map: unit(tex.floorMap),
			normalMap: unit(tex.floorNormal),
			roughness: 0.78,
			metalness: 0.0
		})
	);
	const hazardWallMat = mat(
		new MeshStandardMaterial({
			color: 0xffffff,
			map: unit(tex.hazardMap),
			roughness: 0.6,
			metalness: 0.1
		})
	);
	const bandMat = mat(
		new MeshStandardMaterial({
			color: 0x1f6272,
			roughness: 0.45,
			metalness: 0.3,
			envMapIntensity: 1.1
		})
	);
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
	// Floodlight faces: bright, but not so bright that the bloom turns them into blobs.
	const floodMat = mat(
		new MeshStandardMaterial({
			color: 0x222222,
			emissive: new Color(C.lampWarm),
			emissiveIntensity: 1.5,
			roughness: 0.4
		})
	);
	// Daylight through the clerestory: a sky gradient as emissive map, tinted by the time of day.
	const windowMat = mat(
		new MeshStandardMaterial({
			color: 0x0a1118,
			emissive: new Color(...daylight.sky),
			emissiveMap: tex.skyMap,
			emissiveIntensity: 3.0,
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
	const pipeBlue = mat(
		new MeshStandardMaterial({ color: 0x2d73b5, roughness: 0.4, metalness: 0.6 })
	);
	const pipeRed = mat(
		new MeshStandardMaterial({ color: 0xb8402f, roughness: 0.4, metalness: 0.6 })
	);
	const cabinetMat = mat(
		new MeshStandardMaterial({ color: 0x69747f, roughness: 0.5, metalness: 0.5 })
	);
	const ledMat = mat(
		new MeshStandardMaterial({
			color: 0x06140c,
			emissive: new Color(0x2fe38a),
			emissiveIntensity: 3
		})
	);
	const extinguisherMat = mat(
		new MeshStandardMaterial({ color: 0xc23b2b, roughness: 0.4, metalness: 0.3 })
	);
	const platesMat = mat(
		new MeshStandardMaterial({ color: 0x2a3138, roughness: 0.55, metalness: 0.3 })
	);

	// Floor and walls (one mesh for all four walls)
	const floor = new Mesh(geo(new PlaneGeometry(2 * W, 2 * W)), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	floor.name = 'floor';
	root.add(floor);

	const walls = new Mesh(geo(wallStrip(0, H, 0, (a, y) => [a / (2 * W), y / H])), wallMat);
	walls.receiveShadow = true;
	walls.name = 'walls';
	root.add(walls);
	// Bands in front of the cladding: painted blockwork with a hazard stripe at the foot, a teal
	// paint band at the height of the crane, lighter cladding above it up to the windows.
	for (const [g, m, name] of [
		[wallStrip(0, 3.6, 0.03, (a, y) => [a / 8, y / 8]), wainscotMat, 'wainscot'],
		[wallStrip(3.6, 4.15, 0.035, (a, y) => [a * 1.1, y * 1.1]), hazardWallMat, 'wall-hazard'],
		[wallStrip(22.4, 24.0, 0.03, (a, y) => [a / 8, y / 8]), bandMat, 'wall-band'],
		[wallStrip(24.0, 31.4, 0.02, (a, y) => [a / (2 * W), y / H]), wallLightMat, 'wall-upper']
	] as const) {
		const mesh = new Mesh(geo(g), m);
		mesh.name = name;
		mesh.receiveShadow = true;
		root.add(mesh);
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
		// Sills catch the light from the glass.
		trim.box([p, 31.3, -W + 0.3], [8.6, 0.16, 0.5]);
		trim.box([p, 31.3, W - 0.3], [8.6, 0.16, 0.5]);
		trim.box([-W + 0.3, 31.3, p], [0.5, 0.16, 8.6]);
		trim.box([W - 0.3, 31.3, p], [0.5, 0.16, 8.6]);
	}
	// Bay door on the back wall: frame, two leaves with ribs, and the bright gap between them.
	frame.box([0, 17.5, -W + 0.25], [17.2, 35, 0.5]);
	for (const s of [-1, 1]) {
		trim.box([s * 4.1, 16.4, -W + 0.45], [8.1, 32.4, 0.4]);
		for (let y = 2; y < 32; y += 2.4) frame.box([s * 4.1, y, -W + 0.7], [7.9, 0.22, 0.25]);
	}
	doorGlow.box([0, 16.4, -W + 0.85], [0.3, 32.4, 0.12]);
	// Hazard chevrons on the foot of the door leaves and a number on each (painted by the sign atlas).
	const doorTrim = new Batch(yellowPaint);
	for (const s of [-1, 1]) doorTrim.box([s * 4.1, 0.9, -W + 0.68], [8.0, 0.32, 0.06]);

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
	function tower(cx: number, cz: number, height: number): void {
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
		// Working decks every 6 m with railings on the two sides away from the vessel; the swing arms
		// (`buildArms`) leave from the open corner towards the stack.
		const bx = cx + Math.sign(cx) * 1.9;
		const bz = cz + Math.sign(cz) * 1.9;
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
			rails.beam([cx - 1.9, y + 1.05, bz], [cx + 1.9, y + 1.05, bz], 0.06);
			rails.beam([bx, y + 1.05, cz - 1.9], [bx, y + 1.05, cz + 1.9], 0.06);
		}
	}
	for (const t of TOWERS) tower(t.x, t.z, t.height);

	// Swing arms, retracted to the towers (plan 255): one short truss per deck, nothing in the middle.
	const arms = new Group();
	arms.name = 'arms';
	root.add(arms);
	function buildArms(): void {
		for (const c of [...arms.children]) {
			arms.remove(c);
			if (c instanceof Mesh) c.geometry.dispose();
		}
		const truss = new Batch(steel);
		const plank = new Batch(deckMat);
		const rail = new Batch(yellowPaint);
		for (const t of TOWERS) {
			const d = Math.hypot(t.x, t.z);
			const ux = -t.x / d;
			const uz = -t.z / d;
			const nx = -uz;
			const nz = ux;
			const out = 1.95 / Math.max(Math.abs(ux), Math.abs(uz));
			const x0 = t.x + ux * out;
			const z0 = t.z + uz * out;
			const x1 = x0 + ux * ARM_STUB;
			const z1 = z0 + uz * ARM_STUB;
			const len = Math.hypot(x1 - x0, z1 - z0);
			const yaw = Math.atan2(ux, uz);
			for (let y = 6; y <= t.height - 3; y += 6) {
				const side = (k: number, h: number) =>
					[
						[x0 + nx * k, y + h, z0 + nz * k],
						[x1 + nx * k, y + h, z1 + nz * k]
					] as const;
				truss.beam(...side(-0.4, -0.12), 0.16);
				truss.beam(...side(0.4, -0.12), 0.16);
				truss.beam([x0, y + 0.3, z0], [x1, y + 0.05, z1], 0.1);
				plank.add(new BoxGeometry(1.0, 0.1, len), [(x0 + x1) / 2, y, (z0 + z1) / 2], {
					axis: [0, 1, 0],
					angle: yaw
				});
				rail.beam(...side(-0.55, 1.0), 0.05);
				rail.beam(...side(0.55, 1.0), 0.05);
			}
		}
		for (const [b, name] of [
			[truss, 'arm-truss'],
			[plank, 'arm-deck'],
			[rail, 'arm-rails']
		] as const) {
			const mesh = b.build(name);
			if (mesh) arms.add(mesh);
		}
	}
	buildArms();
	/** Kept for the view's sake: the arms no longer follow the vessel (plan 255). */
	const setVesselRadius = (_radius: number | null): void => {};

	// Floodlights on the towers' lower decks, aimed at the vessel. The fixtures are always there;
	// the high variant adds real spot lights at the same places.
	const floods = new Batch(floodMat);
	const floodHousing = new Batch(darkSteel);
	const workLights: SpotLight[] = [];
	const target = new Object3D();
	target.position.set(0, 6, 0);
	const floodAt = (
		t: (typeof TOWERS)[number],
		y: number,
		shift: number
	): [number, number, number] => {
		const d = Math.hypot(t.x, t.z);
		const [ux, uz] = [-t.x / d, -t.z / d];
		return [t.x + ux * 2.4 - uz * shift, y, t.z + uz * 2.4 + ux * shift];
	};
	const [left, right] = TOWERS;
	for (const [fx, fy, fz, colour] of [
		[...floodAt(left, 13.2, 1.1), 0xe4eeff],
		[...floodAt(left, 19.2, -1.1), 0xe4eeff],
		[...floodAt(right, 13.2, 0), 0xffe6c8]
	] as const) {
		const yaw = Math.atan2(-fx, -fz);
		const q = { axis: [0, 1, 0] as const, angle: yaw };
		floodHousing.add(new BoxGeometry(1.15, 0.7, 0.3), [fx, fy, fz], q);
		floods.add(
			new BoxGeometry(1.0, 0.55, 0.06),
			[fx + Math.sin(yaw) * 0.17, fy, fz + Math.cos(yaw) * 0.17],
			q
		);
		if (high) {
			// a third farther than at the old towers: the intensity follows the square of it
			const light = new SpotLight(colour, 820, 64, 0.42, 0.8, 2);
			light.position.set(fx, fy, fz);
			light.target = target;
			workLights.push(light);
		}
	}
	if (high) root.add(target);

	// Overhead crane: the rails are fixed, bridge, trolley, cables and hook move (`hangar-movers.ts`).
	const craneRail = new Batch(darkSteel);
	craneRail.box([-W + 1.6, 36.6, 0], [0.5, 0.5, 2 * W - 3]);
	craneRail.box([W - 1.6, 36.6, 0], [0.5, 0.5, 2 * W - 3]);
	const movers = createMoverMaterials();
	for (const m of Object.values(movers)) disposables.push(m);
	const crane = createCrane(movers, W);
	const tug = createTug(movers);
	const crew = createCrew(movers, CREW);
	disposables.push(...crane.geometries, ...tug.geometries, ...crew.geometries, ...crew.materials);
	root.add(crane.bridge, tug.tug, tug.trailer, ...crew.meshes);
	const poseMovers = (t: number, motion: boolean): void => {
		poseCrane(crane, cranePose(t));
		poseTug(tug, t, motion);
		crew.pose(t);
	};
	poseMovers(REST_TIME, false);

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
	// The tug lane: edge lines either side of the loop the tug drives.
	const zc = (LANE.zEast + LANE.zWest) / 2;
	for (const dz of [-2.55, 2.55]) {
		lines.box([0, 0.012, zc + dz], [LANE.x1 - LANE.x0 + 4, 0.012, 0.12]);
	}

	// Pipes, ducts, cable trays, cabinets and extinguishers along the walls: the clutter of a working hall.
	const pipesBlue = new Batch(pipeBlue);
	const pipesRed = new Batch(pipeRed);
	const ducts = new Batch(steel);
	const cabinets = new Batch(cabinetMat);
	const leds = new Batch(ledMat);
	const extinguishers = new Batch(extinguisherMat);
	const pipeRuns: [number, number, number][][] = [
		// Left and right walls, full length; back and front walls leave the door and the bay clear.
		[
			[-W + 1.5, 5.2, -27],
			[-W + 1.5, 5.2, 27]
		],
		[
			[W - 1.5, 5.2, -27],
			[W - 1.5, 5.2, 27]
		],
		[
			[-27, 5.2, -W + 1.5],
			[-11, 5.2, -W + 1.5]
		],
		[
			[11, 5.2, -W + 1.5],
			[27, 5.2, -W + 1.5]
		],
		[
			[-27, 5.2, W - 1.5],
			[27, 5.2, W - 1.5]
		]
	];
	for (const [a, b] of pipeRuns) {
		pipesBlue.pipe(a!, b!, 0.14);
		pipesRed.pipe([a![0]!, a![1]! + 0.45, a![2]!], [b![0]!, b![1]! + 0.45, b![2]!], 0.1);
		// Brackets every 5 m.
		const n = Math.round(Math.hypot(b![0]! - a![0]!, b![2]! - a![2]!) / 5);
		for (let k = 0; k <= n; k++) {
			const f = k / n;
			const x = a![0]! + (b![0]! - a![0]!) * f;
			const z = a![2]! + (b![2]! - a![2]!) * f;
			ducts.box([x, 4.9, z], [0.12, 0.9, 0.12]);
		}
	}
	// Ventilation ducts under the girt on the side walls, and drops where the pipes go to the floor.
	ducts.box([-W + 2.0, 15, 0], [1.5, 1.2, 2 * W - 12]);
	ducts.box([W - 2.0, 15, 0], [1.5, 1.2, 2 * W - 12]);
	for (const z of [-16, 16]) {
		pipesBlue.pipe([-W + 1.5, 5.2, z], [-W + 1.5, 0.1, z], 0.14);
		pipesRed.pipe([W - 1.5, 5.65, z], [W - 1.5, 0.1, z], 0.1);
	}
	for (const [x, z, ry] of [
		[-27, -W + 0.5, 0],
		[17, -W + 0.5, 0],
		[-W + 0.5, 18, Math.PI / 2],
		[W - 0.5, -14, -Math.PI / 2],
		[-W + 0.5, -20, Math.PI / 2]
	] as const) {
		cabinets.add(new BoxGeometry(1.3, 2.3, 0.7), [x, 1.15, z], { axis: [0, 1, 0], angle: ry });
		for (const f of [0.35, 0.55, 0.75]) {
			leds.add(
				new BoxGeometry(0.1, 0.06, 0.04),
				[
					x + Math.cos(ry) * (f - 0.55) + Math.sin(ry) * 0.36,
					1.2 + f,
					z - Math.sin(ry) * (f - 0.55) + Math.cos(ry) * 0.36
				],
				{ axis: [0, 1, 0], angle: ry }
			);
		}
	}
	for (const i of [-2, 0, 2]) {
		extinguishers.box([i * 10 + 0.4, 1.4, -W + 1.25], [0.22, 0.55, 0.22]);
		extinguishers.box([W - 1.25, 1.4, i * 10 - 0.4], [0.22, 0.55, 0.22]);
	}

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

	// Lettering. Over the door a dark panel; on the back wall a hanging sign at eye height of the
	// default camera, lit by a bar above it. The view paints the canvas texture (needs a DOM).
	const sign = new Mesh(geo(new PlaneGeometry(17, 17 / (2048 / 384))), signMat);
	sign.position.set(0, 38.9, -W + 0.56);
	sign.name = 'sign';
	root.add(sign);
	const wallSign = new Mesh(geo(new PlaneGeometry(13.6, 13.6 / (2048 / 384))), signMat);
	wallSign.position.set(-15.2, 11.4, -W + 1.45);
	wallSign.name = 'sign-wall';
	root.add(wallSign);
	const signFrame = new Batch(darkSteel);
	signFrame.box([-15.2, 11.4, -W + 1.38], [14.0, 2.95, 0.1]);
	for (const dx of [-6.5, 6.5])
		signFrame.beam([-15.2 + dx, 12.9, -W + 1.4], [-15.2 + dx, 20, -W + 1.4], 0.06);
	const signLight = new Batch(lampMat);
	signLight.box([-15.2, 13.15, -W + 1.7], [13.6, 0.12, 0.3]);
	lampHousing.box([-15.2, 13.3, -W + 1.7], [13.8, 0.12, 0.4]);

	// Plates on the columns: numbers and safety signs from one atlas (painted by the view).
	const plateGeos: BufferGeometry[] = [];
	for (let wall = 0; wall < 4; wall++) {
		for (let i = -3; i <= 3; i++) {
			plateGeos.push(plateGeometry(wall, i * 10, 2.9, 0.9, 0.9, numberCell(i + 4)));
		}
	}
	for (const [wall, along, cell] of [
		[0, 10, SAFETY_CELLS.exit],
		[0, -10, SAFETY_CELLS.hardHat],
		[0, -20, SAFETY_CELLS.lox],
		[0, 20, SAFETY_CELLS.ear],
		[1, 10, SAFETY_CELLS.exit],
		[1, -10, SAFETY_CELLS.fire],
		[1, 20, SAFETY_CELLS.noSmoking],
		[2, -10, SAFETY_CELLS.crane],
		[2, 10, SAFETY_CELLS.fire],
		[2, -20, SAFETY_CELLS.hardHat],
		[3, 10, SAFETY_CELLS.noSmoking],
		[3, -10, SAFETY_CELLS.walk],
		[3, 20, SAFETY_CELLS.ear]
	] as const) {
		plateGeos.push(plateGeometry(wall, along, 1.9, 1.1, 0.55, cell));
	}
	const platesGeo = geo(mergeGeometries(plateGeos, false)!);
	for (const g of plateGeos) g.dispose();
	const plates = new Mesh(platesGeo, platesMat);
	plates.name = 'plates';
	root.add(plates);

	const lit = [
		frame,
		trim,
		decks,
		rails,
		post,
		craneRail,
		crates,
		crates2,
		bottles,
		lines,
		lampHousing,
		floodHousing,
		doorTrim,
		pipesBlue,
		pipesRed,
		ducts,
		cabinets,
		extinguishers,
		signFrame
	];
	const glowing = [windows, doorGlow, lampBatch, strips, floods, leds, signLight];
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

	// Daylight (high variant): additive shafts from the sun-facing windows to the floor, and the
	// bright patches they leave there. Sun direction and colour come from the time of day.
	const shafts = new Group();
	shafts.name = 'light-shafts';
	if (high) {
		const toSun = daylight.toSun;
		const shaftParts: BufferGeometry[] = [];
		const patchParts: BufferGeometry[] = [];
		const rect = (wall: 'z-' | 'z+' | 'x-' | 'x+', p: number): [number, number, number][] => {
			const y0 = 31.6;
			const y1 = 35.4;
			const a = p - 4.0;
			const b = p + 4.0;
			const e = W - 0.45;
			switch (wall) {
				case 'z-':
					return [
						[a, y0, -e],
						[b, y0, -e],
						[b, y1, -e],
						[a, y1, -e]
					];
				case 'z+':
					return [
						[a, y0, e],
						[b, y0, e],
						[b, y1, e],
						[a, y1, e]
					];
				case 'x-':
					return [
						[-e, y0, a],
						[-e, y0, b],
						[-e, y1, b],
						[-e, y1, a]
					];
				default:
					return [
						[e, y0, a],
						[e, y0, b],
						[e, y1, b],
						[e, y1, a]
					];
			}
		};
		const facing: Record<string, boolean> = {
			'z-': toSun[2] < -0.15,
			'z+': toSun[2] > 0.15,
			'x-': toSun[0] < -0.15,
			'x+': toSun[0] > 0.15
		};
		for (const wall of ['z-', 'z+', 'x-', 'x+'] as const) {
			if (!facing[wall]) continue;
			for (let i = -3; i < 3; i++) {
				const top = rect(wall, i * 10 + 5);
				const floorQuad = floorPatch(top, toSun);
				if (!floorQuad) continue;
				// A shaft that would end in the wall or outside the room is left out.
				if (floorQuad.some(([x, , z]) => Math.abs(x) > W - 2 || Math.abs(z) > W - 2)) continue;
				const pos: number[] = [];
				const uv: number[] = [];
				for (let k = 0; k < 4; k++) {
					const k2 = (k + 1) % 4;
					const quad = [top[k]!, top[k2]!, floorQuad[k2]!, floorQuad[k]!];
					const uvs = [
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1]
					];
					for (const idx of [0, 1, 2, 0, 2, 3]) {
						pos.push(...quad[idx]!);
						uv.push(...uvs[idx]!);
					}
				}
				const g = new BufferGeometry();
				g.setAttribute('position', new Float32BufferAttribute(pos, 3));
				g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
				g.computeVertexNormals();
				// Shafts fade along their length: uv.y runs from the window (0) to the floor (1).
				const uvA = g.getAttribute('uv');
				for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k), uvA.getY(k) > 0.5 ? 1 : 0);
				shaftParts.push(g);
				const pp: number[] = [];
				const pu: number[] = [];
				const fq = floorQuad.map(([x, , z]) => [x, 0.014, z] as const);
				const puv = [
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 1]
				];
				for (const idx of [0, 1, 2, 0, 2, 3]) {
					pp.push(...fq[idx]!);
					pu.push(...puv[idx]!);
				}
				const pg = new BufferGeometry();
				pg.setAttribute('position', new Float32BufferAttribute(pp, 3));
				pg.setAttribute('uv', new Float32BufferAttribute(pu, 2));
				pg.computeVertexNormals();
				patchParts.push(pg);
			}
		}
		const sunColour = new Color(...daylight.sun);
		if (shaftParts.length > 0) {
			const shaftGeo = geo(mergeGeometries(shaftParts, false)!);
			for (const g of shaftParts) g.dispose();
			const shaftMat = mat(
				new ShaderMaterial({
					transparent: true,
					depthWrite: false,
					blending: AdditiveBlending,
					side: DoubleSide,
					uniforms: { uColor: { value: sunColour }, uStrength: { value: 0.07 } },
					vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ vT = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
					fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.2); float fade = smoothstep(0.0,0.12,vT) * (1.0 - smoothstep(0.5,1.0,vT)); gl_FragColor = vec4(uColor * uStrength * edge * fade, 1.0); }`
				})
			);
			const shaftMesh = new Mesh(shaftGeo, shaftMat);
			shaftMesh.renderOrder = 4;
			shaftMesh.frustumCulled = false;
			shafts.add(shaftMesh);
			const patchGeo = geo(mergeGeometries(patchParts, false)!);
			for (const g of patchParts) g.dispose();
			const patchMat = mat(
				new ShaderMaterial({
					transparent: true,
					depthWrite: false,
					blending: AdditiveBlending,
					polygonOffset: true,
					polygonOffsetFactor: -2,
					polygonOffsetUnits: -2,
					uniforms: { uColor: { value: sunColour }, uStrength: { value: 0.26 } },
					vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
					fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
        void main(){ vec2 e = smoothstep(0.0,0.1,vUv) * (1.0 - smoothstep(0.9,1.0,vUv)); gl_FragColor = vec4(uColor * uStrength * e.x * e.y, 1.0); }`
				})
			);
			const patchMesh = new Mesh(patchGeo, patchMat);
			patchMesh.renderOrder = 3;
			patchMesh.frustumCulled = false;
			shafts.add(patchMesh);
		}
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

	// Everything but the human-scale pieces goes into the scaled shell (see `HANGAR_SCALE`).
	const shell = new Group();
	shell.name = 'hangar-shell';
	shell.scale.setScalar(HANGAR_SCALE);
	const humanScale = new Set<Object3D | null>([
		platform,
		hazardRing,
		glowRing,
		innerRing,
		pad,
		spokesMesh,
		tug.tug,
		tug.trailer,
		...crew.meshes
	]);
	for (const child of [...root.children]) if (!humanScale.has(child)) shell.add(child);
	root.add(shell);
	// the work lights live in the view's scene, not under the shell: place and reach them by hand
	for (const light of workLights) {
		light.position.multiplyScalar(HANGAR_SCALE);
		light.distance *= HANGAR_SCALE;
		light.intensity *= HANGAR_SCALE * HANGAR_SCALE;
	}
	const scaledLamps = lamps.map(
		([x, y, z]) => [x * HANGAR_SCALE, y * HANGAR_SCALE, z * HANGAR_SCALE] as const
	);

	return {
		root,
		lamps: scaledLamps,
		shafts,
		workLights,
		daylight,
		setVesselRadius,
		setReducedMotion(on) {
			reduced = on;
			if (on) poseMovers(REST_TIME, false);
		},
		update(_dt, time) {
			if (!reduced) poseMovers(time, true);
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
			arms.traverse((o) => {
				if (o instanceof Mesh) o.geometry.dispose();
			});
		}
	};
}
