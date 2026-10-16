/**
 * The moving props of the hangar (plan 029): an overhead crane carrying a crate, a tug with a
 * trailer on a lane behind the platform, and ground crew in high-visibility vests. Poses are pure
 * functions of time (unit-tested); the builders make a handful of meshes each (the crew is one
 * instanced mesh per body part for all of them). With reduced motion everything stays at `REST_TIME`.
 */
import {
	BoxGeometry,
	BufferGeometry,
	Color,
	CylinderGeometry,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	SphereGeometry,
	TorusGeometry,
	Vector3,
	type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The time the props show when motion is reduced: a pleasing still frame. */
export const REST_TIME = 23;

// --- crane ---------------------------------------------------------------------------------------------------

export interface CranePose {
	/** z of the bridge on its rails, m. */
	bridgeZ: number;
	/** x of the trolley on the bridge, m. */
	trolleyX: number;
	/** y of the hook block, m. */
	hookY: number;
}

/** Slow, overlapping periods so the crane never repeats a pose; stays clear of the towers and the platform. */
export function cranePose(t: number): CranePose {
	return {
		bridgeZ: -13.5 + 2.5 * Math.sin((2 * Math.PI * t) / 96),
		trolleyX: 0.5 + 8.5 * Math.sin((2 * Math.PI * t) / 71 + 1),
		hookY: 8.9 + 0.9 * Math.sin((2 * Math.PI * t) / 43)
	};
}

export const CRANE = { girderY: 37.3, trolleyY: 36.4, railX: 28.4 } as const;

// --- tug on a lane ---------------------------------------------------------------------------------------------

export const LANE = { x0: -18, x1: 18, zEast: -15.6, zWest: -18.6, speed: 1.9 } as const;
const LANE_R = (LANE.zEast - LANE.zWest) / 2;
const LANE_STRAIGHT = LANE.x1 - LANE.x0;
/** Length of the closed lane (two straights and two half turns), m. */
export const LANE_LENGTH = 2 * LANE_STRAIGHT + 2 * Math.PI * LANE_R;

export interface PlanarPose {
	x: number;
	z: number;
	/** Heading in the xz plane, rad (atan2 of dz, dx). */
	heading: number;
}

/** Position at arc length `s` along the closed lane (any real, wraps). */
export function lanePose(s: number): PlanarPose {
	let d = ((s % LANE_LENGTH) + LANE_LENGTH) % LANE_LENGTH;
	const turn = Math.PI * LANE_R;
	const zc = (LANE.zEast + LANE.zWest) / 2;
	if (d < LANE_STRAIGHT) return { x: LANE.x0 + d, z: LANE.zEast, heading: 0 };
	d -= LANE_STRAIGHT;
	if (d < turn) {
		const a = d / LANE_R; // 0..pi around the east end, turning from +x to -x through +z
		return {
			x: LANE.x1 + Math.sin(a) * LANE_R,
			z: zc + Math.cos(a) * LANE_R,
			heading: -a
		};
	}
	d -= turn;
	if (d < LANE_STRAIGHT) return { x: LANE.x1 - d, z: LANE.zWest, heading: Math.PI };
	d -= LANE_STRAIGHT;
	const a = d / LANE_R;
	return {
		x: LANE.x0 - Math.sin(a) * LANE_R,
		z: zc - Math.cos(a) * LANE_R,
		heading: Math.PI - a
	};
}

/** Where the tug and its trailer are at time `t` (the trailer trails by the tow-bar length along the lane). */
export function tugPoses(t: number): { tug: PlanarPose; trailer: PlanarPose } {
	const s = t * LANE.speed;
	return { tug: lanePose(s), trailer: lanePose(s - TUG_LENGTH) };
}

export const TUG_LENGTH = 3.6;

// --- crew ------------------------------------------------------------------------------------------------------

export interface CrewSpec {
	vest: number;
	hat: number;
	skin: number;
	/** Path: a point, a circle around the platform, or a line paced back and forth. */
	path:
		| { kind: 'stand'; x: number; z: number; facing: number }
		| { kind: 'circle'; radius: number; start: number; direction: 1 | -1 }
		| {
				kind: 'line';
				from: readonly [number, number];
				to: readonly [number, number];
				pause: number;
		  };
}

const VESTS = [0xff7a1a, 0xc8f018, 0xff7a1a, 0xc8f018];
const HATS = [0xf4f4ef, 0xf2c200, 0x2a6fd6, 0xf4f4ef];
const SKINS = [0xf1c9a5, 0xc68c5c, 0x8d5a3a, 0xe0ac80];

export const CREW: readonly CrewSpec[] = [
	{
		vest: VESTS[0]!,
		hat: HATS[0]!,
		skin: SKINS[0]!,
		path: { kind: 'circle', radius: 8.3, start: 0.9, direction: 1 }
	},
	{
		vest: VESTS[1]!,
		hat: HATS[1]!,
		skin: SKINS[1]!,
		path: { kind: 'circle', radius: 8.9, start: 4.1, direction: -1 }
	},
	{
		vest: VESTS[2]!,
		hat: HATS[2]!,
		skin: SKINS[2]!,
		path: { kind: 'line', from: [-17, -11], to: [-12.4, -12.8], pause: 3 }
	},
	{
		vest: VESTS[3]!,
		hat: HATS[3]!,
		skin: SKINS[3]!,
		path: { kind: 'stand', x: -18.4, z: -15.6, facing: -0.6 }
	},
	{
		vest: VESTS[0]!,
		hat: HATS[1]!,
		skin: SKINS[2]!,
		path: { kind: 'stand', x: -17.2, z: -16.4, facing: Math.PI - 0.7 }
	},
	{
		vest: VESTS[1]!,
		hat: HATS[0]!,
		skin: SKINS[3]!,
		path: { kind: 'stand', x: 13.2, z: -9.6, facing: Math.PI + 0.5 }
	},
	{
		vest: VESTS[2]!,
		hat: HATS[3]!,
		skin: SKINS[0]!,
		path: { kind: 'stand', x: 3.4, z: 5.2, facing: -2.2 }
	},
	{
		vest: VESTS[3]!,
		hat: HATS[2]!,
		skin: SKINS[1]!,
		path: { kind: 'stand', x: -6.1, z: -3.8, facing: 0.9 }
	}
];

export const WALK_SPEED = 1.15;

export interface CrewPose {
	x: number;
	z: number;
	/** Yaw about y so the figure faces its walking direction (its front is +x at yaw 0, like the tug). */
	yaw: number;
	/** Distance walked, m; 0 for a standing figure. The legs swing with it. */
	walked: number;
	moving: boolean;
}

export function crewPose(spec: CrewSpec, t: number): CrewPose {
	const p = spec.path;
	if (p.kind === 'stand') return { x: p.x, z: p.z, yaw: p.facing, walked: 0, moving: false };
	if (p.kind === 'circle') {
		const a = p.start + (p.direction * WALK_SPEED * t) / p.radius;
		const tangent = a + (p.direction * Math.PI) / 2;
		return {
			x: Math.cos(a) * p.radius,
			z: Math.sin(a) * p.radius,
			// +x rotated by yaw must point along (cos tangent, sin tangent) in xz: yaw = -tangent.
			yaw: -tangent,
			walked: WALK_SPEED * t,
			moving: true
		};
	}
	const dx = p.to[0] - p.from[0];
	const dz = p.to[1] - p.from[1];
	const len = Math.hypot(dx, dz);
	const leg = len / WALK_SPEED;
	const cycle = 2 * (leg + p.pause);
	const c = ((t % cycle) + cycle) % cycle;
	let u: number;
	let forward = true;
	let moving = true;
	if (c < leg) u = c / leg;
	else if (c < leg + p.pause) {
		u = 1;
		moving = false;
	} else if (c < 2 * leg + p.pause) {
		u = 1 - (c - leg - p.pause) / leg;
		forward = false;
	} else {
		u = 0;
		moving = false;
	}
	const heading = Math.atan2(forward ? dz : -dz, forward ? dx : -dx);
	return {
		x: p.from[0] + dx * u,
		z: p.from[1] + dz * u,
		yaw: -heading,
		walked: moving ? WALK_SPEED * t : 0,
		moving
	};
}

// --- builders ----------------------------------------------------------------------------------------------------

const place = (
	g: BufferGeometry,
	position: readonly [number, number, number],
	rotation: readonly [number, number, number] = [0, 0, 0]
): BufferGeometry => {
	const q = new Quaternion().setFromEuler(new Object3D().rotation.set(...rotation));
	return g.applyMatrix4(new Matrix4().compose(new Vector3(...position), q, new Vector3(1, 1, 1)));
};

const plain = (g: BufferGeometry): BufferGeometry => {
	const out = g.index ? g.toNonIndexed() : g;
	for (const name of Object.keys(out.attributes)) {
		if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
	}
	return out;
};

const merged = (list: BufferGeometry[]): BufferGeometry => {
	const out = mergeGeometries(list.map(plain), false);
	for (const g of list) g.dispose();
	if (!out) throw new Error('Hangar mover geometry could not be merged');
	return out;
};

const box = (
	w: number,
	h: number,
	d: number,
	at: readonly [number, number, number],
	rot?: readonly [number, number, number]
): BufferGeometry => place(new BoxGeometry(w, h, d), at, rot);

export interface MoverMaterials {
	yellow: Material;
	dark: Material;
	glass: Material;
	beacon: MeshStandardMaterial;
	lamp: Material;
	crate: Material;
	white: Material;
	/** Reflective strips on vests. */
	strip: Material;
	pants: Material;
	sleeve: Material;
}

export function createMoverMaterials(): MoverMaterials {
	const std = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial =>
		new MeshStandardMaterial(o);
	return {
		yellow: std({ color: 0xe3a61f, roughness: 0.5, metalness: 0.25 }),
		dark: std({ color: 0x1e242b, roughness: 0.6, metalness: 0.6 }),
		glass: std({
			color: 0x0a1a24,
			roughness: 0.15,
			metalness: 0.2,
			emissive: new Color(0x1a3a52),
			emissiveIntensity: 0.6
		}),
		beacon: std({
			color: 0x331500,
			emissive: new Color(0xff8a1a),
			emissiveIntensity: 3,
			roughness: 0.4
		}),
		lamp: std({
			color: 0x222222,
			emissive: new Color(0xfff0d8),
			emissiveIntensity: 4,
			roughness: 0.4
		}),
		crate: std({ color: 0x3c5f78, roughness: 0.65, metalness: 0.3 }),
		white: std({ color: 0xdfe4ea, roughness: 0.45, metalness: 0.2 }),
		strip: std({
			color: 0xcfd6dc,
			roughness: 0.3,
			metalness: 0.6,
			emissive: new Color(0x6a7480),
			emissiveIntensity: 0.9
		}),
		pants: std({ color: 0x1f2a3c, roughness: 0.85 }),
		sleeve: std({ color: 0x2b3340, roughness: 0.85 })
	};
}

export interface Crane {
	/** Everything that moves with the bridge; add to the hangar root. */
	bridge: Group;
	trolley: Group;
	hook: Group;
	cables: Mesh[];
	geometries: BufferGeometry[];
}

/** Bridge girders and trucks on the side rails, a trolley, two cables and a hook with a slung crate. */
export function createCrane(m: MoverMaterials, half: number): Crane {
	const geometries: BufferGeometry[] = [];
	const own = (g: BufferGeometry): BufferGeometry => {
		geometries.push(g);
		return g;
	};
	const bridge = new Group();
	bridge.name = 'crane-bridge';
	const span = 2 * half - 3;
	const girders = own(
		merged([
			box(span, 1.1, 0.9, [0, CRANE.girderY, -1]),
			box(span, 1.1, 0.9, [0, CRANE.girderY, 1]),
			box(1.6, 1.1, 3.4, [-CRANE.railX, CRANE.girderY, 0]),
			box(1.6, 1.1, 3.4, [CRANE.railX, CRANE.girderY, 0])
		])
	);
	const bridgeMesh = new Mesh(girders, m.yellow);
	bridgeMesh.castShadow = true;
	// Walkway rail and a lamp on the bridge.
	const lampGeo = own(merged([box(0.5, 0.2, 0.5, [0, CRANE.girderY - 0.7, 0])]));
	const bridgeLamp = new Mesh(lampGeo, m.lamp);
	bridge.add(bridgeMesh, bridgeLamp);

	const trolley = new Group();
	trolley.name = 'crane-trolley';
	const trolleyGeo = own(
		merged([
			box(2.2, 0.9, 2.4, [0, CRANE.trolleyY, 0]),
			box(0.5, 0.5, 0.5, [0.8, CRANE.trolleyY - 0.7, 0.6])
		])
	);
	const trolleyMesh = new Mesh(trolleyGeo, m.dark);
	trolleyMesh.castShadow = true;
	trolley.add(trolleyMesh);
	const cableGeo = own(new CylinderGeometry(0.035, 0.035, 1, 6).translate(0, -0.5, 0));
	const cables: Mesh[] = [];
	for (const dx of [-0.3, 0.3]) {
		const c = new Mesh(cableGeo, m.dark);
		c.position.set(dx, CRANE.trolleyY - 0.4, 0);
		cables.push(c);
		trolley.add(c);
	}

	// Hook block, hook, slings and the crate, in a frame whose origin is the block's top.
	const hook = new Group();
	hook.name = 'crane-hook';
	const block = own(merged([box(0.9, 0.6, 0.55, [0, -0.3, 0]), box(0.7, 0.18, 0.4, [0, -0.7, 0])]));
	const hookGeo = own(
		merged([
			place(
				new TorusGeometry(0.22, 0.05, 8, 18, Math.PI * 1.5),
				[0, -1.05, 0],
				[0, 0, Math.PI * 0.25]
			),
			// Slings from the hook to the four lifting eyes of the crate.
			...[
				[-1.2, -0.8],
				[1.2, -0.8],
				[-1.2, 0.8],
				[1.2, 0.8]
			].map(([x, z]) => {
				const a = new Vector3(0, -1.2, 0);
				const b = new Vector3(x, -3.2, z);
				const d = b.clone().sub(a);
				const g = new CylinderGeometry(0.025, 0.025, d.length(), 5);
				g.applyQuaternion(
					new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize())
				);
				g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
				return g;
			})
		])
	);
	const crateGeo = own(
		merged([
			box(3.0, 1.5, 1.8, [0, -4.0, 0]),
			box(3.1, 0.12, 0.3, [0, -3.5, 0.6]),
			box(3.1, 0.12, 0.3, [0, -3.5, -0.6]),
			box(0.14, 1.52, 1.82, [-1.0, -4.0, 0]),
			box(0.14, 1.52, 1.82, [1.0, -4.0, 0])
		])
	);
	const hookBlock = new Mesh(block, m.yellow);
	const hookMesh = new Mesh(hookGeo, m.dark);
	const crate = new Mesh(crateGeo, m.crate);
	for (const mesh of [hookBlock, hookMesh, crate]) mesh.castShadow = true;
	hook.add(hookBlock, hookMesh, crate);
	trolley.add(hook);
	bridge.add(trolley);
	return { bridge, trolley, hook, cables, geometries };
}

/** Places the crane at `pose`; the cables stretch from the trolley to the hook block. */
export function poseCrane(crane: Crane, pose: CranePose): void {
	crane.bridge.position.z = pose.bridgeZ;
	crane.trolley.position.x = pose.trolleyX;
	crane.hook.position.set(0, pose.hookY, 0);
	const len = CRANE.trolleyY - 0.4 - pose.hookY;
	for (const c of crane.cables) c.scale.y = Math.max(0.1, len);
}

export interface Tug {
	tug: Group;
	trailer: Group;
	geometries: BufferGeometry[];
}

/** A small yard tug (front towards +x) and a flat trailer with a tank on a cradle. */
export function createTug(m: MoverMaterials): Tug {
	const geometries: BufferGeometry[] = [];
	const own = (g: BufferGeometry): BufferGeometry => {
		geometries.push(g);
		return g;
	};
	const wheel = (x: number, z: number): BufferGeometry =>
		place(new CylinderGeometry(0.3, 0.3, 0.26, 14), [x, 0.3, z], [Math.PI / 2, 0, 0]);
	const tug = new Group();
	tug.name = 'tug';
	const body = new Mesh(
		own(
			merged([
				box(2.1, 0.55, 1.25, [0, 0.62, 0]),
				box(1.0, 0.85, 1.15, [-0.35, 1.3, 0]),
				box(0.2, 0.25, 1.1, [1.05, 0.55, 0])
			])
		),
		m.yellow
	);
	const dark = new Mesh(
		own(
			merged([
				wheel(0.75, 0.62),
				wheel(0.75, -0.62),
				wheel(-0.75, 0.62),
				wheel(-0.75, -0.62),
				box(0.22, 0.2, 1.3, [1.15, 0.38, 0]),
				box(0.5, 0.1, 0.7, [-1.2, 0.5, 0]),
				box(1.02, 0.1, 1.17, [-0.35, 1.78, 0])
			])
		),
		m.dark
	);
	const glass = new Mesh(
		own(
			merged([
				box(0.05, 0.5, 1.0, [0.17, 1.38, 0]),
				box(0.8, 0.45, 0.04, [-0.35, 1.4, 0.58]),
				box(0.8, 0.45, 0.04, [-0.35, 1.4, -0.58])
			])
		),
		m.glass
	);
	const lights = new Mesh(
		own(
			merged([box(0.06, 0.12, 0.2, [1.16, 0.62, 0.4]), box(0.06, 0.12, 0.2, [1.16, 0.62, -0.4])])
		),
		m.lamp
	);
	const beacon = new Mesh(own(merged([box(0.16, 0.16, 0.16, [-0.55, 1.9, 0])])), m.beacon);
	beacon.name = 'tug-beacon';
	for (const mesh of [body, dark, glass, lights, beacon]) {
		mesh.castShadow = true;
		tug.add(mesh);
	}

	const trailer = new Group();
	trailer.name = 'trailer';
	const deck = new Mesh(
		own(
			merged([
				box(2.6, 0.14, 1.3, [0, 0.55, 0]),
				wheel(-0.5, 0.64),
				wheel(-0.5, -0.64),
				box(1.3, 0.06, 0.06, [1.9, 0.45, 0]),
				box(0.12, 0.24, 1.1, [-0.7, 0.72, 0]),
				box(0.12, 0.24, 1.1, [0.7, 0.72, 0])
			])
		),
		m.dark
	);
	// The load: a propellant tank lying on the deck.
	const tank = new Mesh(
		own(
			merged([
				place(new CylinderGeometry(0.5, 0.5, 2.3, 22), [0, 1.35, 0], [0, 0, Math.PI / 2]),
				place(new SphereGeometry(0.5, 14, 8), [1.15, 1.35, 0]),
				place(new SphereGeometry(0.5, 14, 8), [-1.15, 1.35, 0])
			])
		),
		m.white
	);
	for (const mesh of [deck, tank]) {
		mesh.castShadow = true;
		trailer.add(mesh);
	}
	return { tug, trailer, geometries };
}

export function poseTug(tug: Tug, t: number, motion: boolean): void {
	const poses = tugPoses(t);
	for (const [g, p] of [
		[tug.tug, poses.tug],
		[tug.trailer, poses.trailer]
	] as const) {
		g.position.set(p.x, 0, p.z);
		g.rotation.y = -p.heading;
	}
	const beacon = tug.tug.getObjectByName('tug-beacon') as Mesh | undefined;
	if (beacon) {
		(beacon.material as MeshStandardMaterial).emissiveIntensity = motion
			? 1.2 + 2.6 * Math.max(0, Math.sin(t * 7))
			: 3;
	}
}

export interface Crew {
	meshes: InstancedMesh[];
	/** Materials created for the crew (the shared mover materials are the caller's). */
	materials: Material[];
	geometries: BufferGeometry[];
	/** Writes the matrices of all figures for time `t`. */
	pose(t: number): void;
}

const EULER_Q = new Quaternion();
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const tmp = new Matrix4();

/**
 * All crew as 7 instanced meshes (legs, torso, strips, arms, head, hat, one call each): the same
 * geometry for every figure, vest/hat/skin colours per instance.
 */
export function createCrew(m: MoverMaterials, specs: readonly CrewSpec[] = CREW): Crew {
	const n = specs.length;
	const legGeo = new BoxGeometry(0.16, 0.86, 0.18).translate(0, -0.43, 0);
	const torsoGeo = new BoxGeometry(0.42, 0.58, 0.25).translate(0, 0.29, 0);
	const stripGeo = merged([
		box(0.435, 0.05, 0.265, [0, 0.14, 0]),
		box(0.435, 0.05, 0.265, [0, 0.38, 0]),
		box(0.05, 0.58, 0.265, [0.11, 0.29, 0]),
		box(0.05, 0.58, 0.265, [-0.11, 0.29, 0])
	]);
	const armGeo = new BoxGeometry(0.1, 0.56, 0.1).translate(0, -0.28, 0);
	const headGeo = new SphereGeometry(0.105, 12, 9);
	const hatGeo = merged([
		place(new SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.02, 0]),
		place(new CylinderGeometry(0.15, 0.15, 0.015, 14), [0.04, 0.02, 0])
	]);
	const geometries = [legGeo, torsoGeo, stripGeo, armGeo, headGeo, hatGeo];
	const make = (g: BufferGeometry, mat: Material, count: number): InstancedMesh => {
		const im = new InstancedMesh(g, mat, count);
		im.castShadow = true;
		im.frustumCulled = false;
		return im;
	};
	const legs = make(legGeo, m.pants, n * 2);
	const tinted = [
		new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
		new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }),
		new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
	];
	const torso = make(torsoGeo, tinted[0]!, n);
	const strips = make(stripGeo, m.strip, n);
	const arms = make(armGeo, m.sleeve, n * 2);
	const heads = make(headGeo, tinted[1]!, n);
	const hats = make(hatGeo, tinted[2]!, n);
	specs.forEach((s, i) => {
		torso.setColorAt(i, new Color(s.vest));
		heads.setColorAt(i, new Color(s.skin));
		hats.setColorAt(i, new Color(s.hat));
	});
	const meshes = [legs, torso, strips, arms, heads, hats];
	for (const mesh of [torso, heads, hats]) {
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	const put = (im: InstancedMesh, index: number, base: Matrix4, local: Matrix4): void => {
		im.setMatrixAt(index, tmp.multiplyMatrices(base, local));
	};
	const local = new Matrix4();
	const compose = (x: number, y: number, z: number, swing = 0): Matrix4 =>
		local.compose(
			new Vector3(x, y, z),
			EULER_Q.setFromAxisAngle(AXIS_X, swing),
			new Vector3(1, 1, 1)
		);

	return {
		meshes,
		materials: tinted,
		geometries,
		pose(t) {
			specs.forEach((spec, i) => {
				const p = crewPose(spec, t);
				const phase = (p.walked / 0.72) * Math.PI;
				const swing = p.moving ? Math.sin(phase) * 0.55 : 0;
				const bob = p.moving ? Math.abs(Math.sin(phase)) * 0.03 : 0;
				// Figure frame: front +x, so the legs swing about z; rotate the pieces' local +z swing axis into place.
				const base = new Matrix4().compose(
					new Vector3(p.x, bob, p.z),
					EULER_Q.clone().setFromAxisAngle(AXIS_Y, p.yaw),
					new Vector3(1, 1, 1)
				);
				// Swing is about the figure's side axis (z); build with a quarter turn so x-axis swing maps to it.
				const side = (x: number, y: number, z: number, a: number): Matrix4 =>
					local.compose(
						new Vector3(x, y, z),
						EULER_Q.setFromAxisAngle(new Vector3(0, 0, 1), -a),
						new Vector3(1, 1, 1)
					);
				put(legs, i * 2, base, side(0, 0.86, 0.1, swing));
				put(legs, i * 2 + 1, base, side(0, 0.86, -0.1, -swing));
				put(torso, i, base, compose(0, 0.86, 0));
				put(strips, i, base, compose(0, 0.86, 0));
				put(arms, i * 2, base, side(0, 1.4, 0.26, -swing * 0.8));
				put(arms, i * 2 + 1, base, side(0, 1.4, -0.26, swing * 0.8));
				put(heads, i, base, compose(0.01, 1.58, 0));
				put(hats, i, base, compose(0.01, 1.64, 0));
			});
			for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
		}
	};
}
