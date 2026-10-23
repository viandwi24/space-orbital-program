/**
 * The moving props of the hangar (plan 029): an overhead crane carrying a crate, a tug with a
 * trailer on a lane behind the platform, and people at work: the crew character of plan 341 in
 * engineer, scientist, mechanic and researcher outfits. Poses are pure functions of time
 * (unit-tested); the builders make a handful of meshes each (one skinned mesh per person). With
 * reduced motion everything stays at `REST_TIME`.
 */
import {
	BoxGeometry,
	BufferGeometry,
	Color,
	CylinderGeometry,
	Group,
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
import { createWalkers, type CrewSpec, type Walkers as Crew } from '../crew/walkers.ts';

export { WALK_SPEED, crewPose, type CrewPose, type CrewSpec } from '../crew/walkers.ts';
export type { Crew };

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

/** Slow, overlapping periods so the crane never repeats a pose; it runs between the towers (|x| < 13.4) and behind the platform. */
export function cranePose(t: number): CranePose {
	return {
		bridgeZ: -13.5 + 2.5 * Math.sin((2 * Math.PI * t) / 96),
		trolleyX: 0.5 + 8.5 * Math.sin((2 * Math.PI * t) / 71 + 1),
		hookY: 8.9 + 0.9 * Math.sin((2 * Math.PI * t) / 43)
	};
}

export const CRANE = { girderY: 37.3, trolleyY: 36.4, railX: 28.4 } as const;

// --- tug on a lane ---------------------------------------------------------------------------------------------

/** The tug's loop (plan 220): behind the towers' bases (z = -11.4 to -14.6) and short of the crates. */
export const LANE = { x0: -16, x1: 16, zEast: -18.6, zWest: -21.6, speed: 1.9 } as const;
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

/** The Hangar's people at work (owner, 2026-10-22), in the outfits registered for `hangar` (ADR 0313). */
export const CREW: readonly CrewSpec[] = [
	{
		id: 'hangar-1',
		path: { kind: 'circle', radius: 8.3, start: 0.9, direction: 1 }
	},
	{
		id: 'hangar-2',
		path: { kind: 'circle', radius: 8.9, start: 4.1, direction: -1 }
	},
	{
		id: 'hangar-3',
		path: { kind: 'line', from: [-19.5, -8.6], to: [-12.8, -9.4], pause: 3 }
	},
	{
		id: 'hangar-9',
		path: { kind: 'line', from: [8.5, 13.5], to: [19, 8.5], pause: 4 }
	},
	{
		id: 'hangar-10',
		path: { kind: 'line', from: [-13.5, 10.5], to: [-21, 4.5], pause: 2.5 }
	},
	{
		id: 'hangar-4',
		action: 'work',
		path: { kind: 'stand', x: -18.6, z: -16.4, facing: -0.6 }
	},
	{
		id: 'hangar-5',
		action: 'work',
		path: { kind: 'stand', x: -17.4, z: -17.2, facing: Math.PI - 0.7 }
	},
	{
		id: 'hangar-6',
		action: 'idle',
		path: { kind: 'stand', x: 13.2, z: -9.6, facing: Math.PI + 0.5 }
	},
	{
		id: 'hangar-7',
		action: 'wave',
		path: { kind: 'stand', x: 4.4, z: 7.6, facing: -2.2 }
	},
	{
		id: 'hangar-8',
		action: 'idle',
		path: { kind: 'stand', x: -6.1, z: -5.8, facing: 0.9 }
	}
];

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

/** The Hangar's crew (plan 341): the shared walkers. */
export function createCrew(_m: MoverMaterials, specs: readonly CrewSpec[] = CREW): Crew {
	return createWalkers(specs, 'hangar');
}
