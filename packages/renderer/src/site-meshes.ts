/**
 * Procedural launch site (ADR 0027, plan 025): the structures from `site-buildings.ts` merged into
 * one mesh per material, plus instanced trees, shrubs, rocks and grass tufts from
 * `site-vegetation.ts`. Everything is built in the site frame (+x east, +y up, +z south, origin at
 * the pad centre) under one root that is placed in float64 on the CPU and turns with the body.
 * Layout lives in `site.ts`; surface wear and wind in `weathering.ts`.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	BufferGeometry,
	Color,
	DataTexture,
	DoubleSide,
	Euler,
	InstancedMesh,
	LinearFilter,
	LinearMipmapLinearFilter,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	PointLight,
	Quaternion,
	RGBAFormat,
	RepeatWrapping,
	SRGBColorSpace,
	UnsignedByteType,
	Vector3,
	BoxGeometry
} from 'three';
import { hash3 } from './noise.ts';
import {
	buildBuildings,
	buildLightPoles,
	buildMasts,
	buildProps,
	buildTanks,
	buildTower
} from './site-buildings.ts';
import { emptyParts, merge, type ArmParts, type Rgb } from './site-geo.ts';
import { buildSiteList, footprintCentre, SITE_CELL, type SiteBuildingView } from './site-list.ts';
import {
	DISH,
	DISH_STOW,
	aimOf,
	buildDishParts,
	dishObject,
	trackStep,
	type DishAim,
	type DishObject
} from './site-dish.ts';

/** The generator of the deep-space dish (plan 234): drawn moving, not merged. */
export const DEEP_SPACE_DISH = 'deep-space-dish';
/** Beyond this camera distance the dishes draw their far model, m. */
const DISH_FAR_DISTANCE = 3_000;
import {
	bushGeometry,
	pineGeometry,
	rockGeometry,
	roundTreeGeometry,
	tuftGeometry
} from './site-vegetation.ts';
import {
	FLOOD_LIGHT_INTENSITY,
	floodLightPositions,
	layoutTufts,
	layoutVegetation,
	siteDetail,
	SITE_PEOPLE,
	tuftCell,
	TUFT_CELLS,
	VENTS
} from './site.ts';
import { createWalkers } from './crew/walkers.ts';
import {
	armStep,
	armTarget,
	beaconLevel,
	newPadTracker,
	padHeight,
	steamVisibility,
	windowGlow
} from './site-animation.ts';
import { SiteSteam } from './site-steam.ts';
import { siteAxes } from './sun.ts';
import { add, rotate, scale } from './vec.ts';
import { siteTime, weatherMaterial, windMaterial } from './weathering.ts';

/** Trees closer than this to the pad cast shadows, m. */
const SHADOW_TREE_RADIUS = 170;

function pixelTexture(size: number, paint: (x: number, y: number) => Rgb): DataTexture {
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const [r, g, b] = paint(x, y);
			const i = (y * size + x) * 4;
			data[i] = Math.round(Math.min(1, r) * 255);
			data[i + 1] = Math.round(Math.min(1, g) * 255);
			data[i + 2] = Math.round(Math.min(1, b) * 255);
			data[i + 3] = 255;
		}
	}
	const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
	t.wrapS = RepeatWrapping;
	t.wrapT = RepeatWrapping;
	t.colorSpace = SRGBColorSpace;
	t.magFilter = LinearFilter;
	t.minFilter = LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.anisotropy = 4;
	t.needsUpdate = true;
	return t;
}

/** Corrugated cladding: ribs across the tile, panel seams every half tile. 4 m per repeat. */
function sidingTexture(): DataTexture {
	return pixelTexture(128, (x, y) => {
		const rib = 0.8 + 0.2 * Math.cos((x / 128) * Math.PI * 2 * 8);
		const grain = 0.94 + 0.06 * hash3(x, y, 1, 3);
		let v = rib * grain;
		if (y % 64 < 2) v *= 0.62;
		if (x % 64 < 1) v *= 0.8;
		return [v, v, v];
	});
}

/** A sliding hangar door: two leaves with panel ribs, a window row and a hazard-striped foot. */
function doorTexture(): DataTexture {
	const size = 256;
	return pixelTexture(size, (x, y) => {
		const u = x / size;
		const v = y / size; // 0 at the foot
		let c: Rgb = [0.2, 0.24, 0.28];
		const panel = Math.floor(u * 8);
		const tone = 0.85 + 0.3 * hash3(panel, 0, 0, 9);
		c = [c[0] * tone, c[1] * tone, c[2] * tone];
		// horizontal ribs
		const rib = Math.abs(((v * 24) % 1) - 0.5);
		if (rib > 0.46) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
		// vertical seams and the meeting line of the leaves
		const seam = Math.abs(((u * 8) % 1) - 0.5);
		if (seam > 0.485) c = [c[0] * 0.45, c[1] * 0.45, c[2] * 0.5];
		if (Math.abs(u - 0.5) < 0.006) c = [0.02, 0.02, 0.025];
		// window row near the top
		if (v > 0.8 && v < 0.88 && (u * 8) % 1 > 0.1 && (u * 8) % 1 < 0.9) {
			const refl = 0.5 + 0.5 * Math.sin(u * 9 + v * 4);
			c = [0.05 + 0.05 * refl, 0.09 + 0.07 * refl, 0.13 + 0.1 * refl];
		}
		// hazard foot
		if (v < 0.045) {
			const stripe = Math.floor((x + y) / 14) % 2;
			c = stripe ? [0.8, 0.58, 0.05] : [0.05, 0.05, 0.05];
		}
		// grime rising from the foot and wear
		c = c.map(
			(k) => k * (0.8 + 0.2 * Math.min(1, v * 4)) * (0.92 + 0.08 * hash3(x, y, 2, 4))
		) as Rgb;
		return c;
	});
}

function siteMaterials() {
	const siding = sidingTexture();
	const door = doorTexture();
	const structure = new MeshStandardMaterial({
		vertexColors: true,
		metalness: 0.55,
		roughness: 0.5
	});
	const painted = new MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.55 });
	const sidingMat = new MeshStandardMaterial({
		vertexColors: true,
		map: siding,
		metalness: 0.25,
		roughness: 0.6
	});
	const doorMat = new MeshStandardMaterial({
		vertexColors: true,
		map: door,
		metalness: 0.35,
		roughness: 0.45
	});
	weatherMaterial(structure, { rust: true });
	weatherMaterial(painted, { amount: 0.8 });
	weatherMaterial(sidingMat, { amount: 1 });
	weatherMaterial(doorMat, { amount: 0.4 });
	const pine = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
	const round = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
	const bush = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
	windMaterial(pine, { height: 10.5, strength: 0.03, leaves: true });
	windMaterial(round, { height: 8, strength: 0.035, leaves: true });
	windMaterial(bush, { height: 1.4, strength: 0.05, leaves: true });
	const tuft = new MeshStandardMaterial({
		vertexColors: true,
		roughness: 1,
		metalness: 0,
		side: DoubleSide
	});
	windMaterial(tuft, { height: 0.35, strength: 0.25, fade: [45, 75] });
	return {
		structure,
		painted,
		siding: sidingMat,
		door: doorMat,
		glass: new MeshStandardMaterial({
			vertexColors: true,
			metalness: 0.9,
			roughness: 0.07,
			envMapIntensity: 1.3
		}),
		// the panes that glow at night: the same glass whose emissive follows the floodlight level (ADR 0073)
		glassLit: new MeshStandardMaterial({
			vertexColors: true,
			metalness: 0.9,
			roughness: 0.07,
			envMapIntensity: 1.3,
			emissive: new Color(1, 0.5, 0.2),
			emissiveIntensity: 0
		}),
		lamp: new MeshBasicMaterial({ vertexColors: true }),
		beaconA: new MeshBasicMaterial({ vertexColors: true }),
		beaconB: new MeshBasicMaterial({ vertexColors: true }),
		pine,
		round,
		bush,
		tuft,
		rock: new MeshStandardMaterial({
			vertexColors: true,
			roughness: 1,
			metalness: 0,
			flatShading: true
		}),
		textures: [siding, door]
	};
}

/** The instanced trees, bushes, rocks and tuft cells of one (trees, tufts) budget (ADR 0055). */
interface VegetationSet {
	meshes: InstancedMesh[];
	tufts: InstancedMesh[];
	rocks: InstancedMesh[];
	trees: InstancedMesh[];
	/** Every mesh is built; before that the set is partial and must not be shown. */
	ready: boolean;
}

/** One site's materials (`siteMaterials`), shared by every site's buildings (ADR 0321). */
export type SiteMaterials = ReturnType<typeof siteMaterials>;

/**
 * One site's list buildings, roads, deep-space dishes and the build ghost (plan 384, ADR 0321), in
 * site-local metres (x east, y up, z south). It draws with the materials it is given: another
 * site's buildings share the HQ's, so showing them compiles nothing. The HQ's `LaunchSite` holds
 * one at its own origin; another home site's stands alone and is placed with `place`.
 */
export class SiteBuildings {
	readonly root = new Object3D();
	private readonly listGroup = new Object3D();
	private listGeometries: BufferGeometry[] = [];
	/** Deep-space dishes of the list (plan 234): a near and a far model each, and where they point. */
	private dishes: Array<{ near: DishObject; far: DishObject; at: Vector3; aim: DishAim }> = [];
	private dishFar = false;
	private listKey = '';
	private ghost: Mesh | null = null;
	private ghostGeometry: BufferGeometry | null = null;
	private siteUp: Vec3 = { x: 1, y: 0, z: 0 };
	private siteQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };

	constructor(
		private readonly materials: SiteMaterials,
		private readonly radius: number,
		site?: { latitude: number; longitude: number }
	) {
		this.root.name = 'site-buildings';
		this.listGroup.name = 'site-building-list';
		this.root.add(this.listGroup);
		if (site) this.setSite(site.latitude, site.longitude);
	}

	/** Where a standalone site stands (a branch); the HQ's follows its `LaunchSite`. */
	setSite(latitude: number, longitude: number): void {
		const axes = siteAxes(latitude, longitude);
		this.siteUp = axes.up;
		const south = scale(axes.north, -1);
		const q = new Quaternion().setFromRotationMatrix(
			new Matrix4().makeBasis(
				new Vector3(axes.east.x, axes.east.y, axes.east.z),
				new Vector3(axes.up.x, axes.up.y, axes.up.z),
				new Vector3(south.x, south.y, south.z)
			)
		);
		this.siteQuat = { x: q.x, y: q.y, z: q.z, w: q.w };
	}

	/** Puts a standalone site on the rotating body, as `LaunchSite.place` does. */
	place(bodyRender: Vec3, bodyRotation: Quat): void {
		const p = add(bodyRender, rotate(bodyRotation, scale(this.siteUp, this.radius)));
		this.root.position.set(p.x, p.y, p.z);
		const q = new Quaternion(
			bodyRotation.x,
			bodyRotation.y,
			bodyRotation.z,
			bodyRotation.w
		).multiply(new Quaternion(this.siteQuat.x, this.siteQuat.y, this.siteQuat.z, this.siteQuat.w));
		this.root.quaternion.copy(q);
		this.root.updateMatrixWorld(true);
	}

	/** The dishes' near or far model by the camera's distance from the site, m. */
	setDishDistance(distance: number): void {
		this.dishFar = distance > DISH_FAR_DISTANCE;
		for (const dish of this.dishes) {
			dish.near.root.visible = !this.dishFar;
			dish.far.root.visible = this.dishFar;
		}
	}

	/**
	 * Draw these buildings and road cells, one mesh per material; rebuilt only when the list changed.
	 */
	setBuildings(
		list: readonly SiteBuildingView[],
		roads: readonly { i: number; j: number }[]
	): void {
		const key = JSON.stringify([list, roads]);
		if (key === this.listKey) return;
		this.listKey = key;
		for (const child of [...this.listGroup.children]) this.listGroup.remove(child);
		for (const g of this.listGeometries) g.dispose();
		this.listGeometries = [];
		// deep-space dishes move: drawn as their own nested groups, not merged (plan 234)
		this.dishes = [];
		const dishes = list.filter((b) => b.generator === DEEP_SPACE_DISH);
		const parts = buildSiteList(
			list.filter((b) => b.generator !== DEEP_SPACE_DISH),
			roads
		);
		const m = this.materials;
		const add = (
			geos: BufferGeometry[],
			material: MeshStandardMaterial | MeshBasicMaterial,
			shadows = true
		) => {
			if (!geos.length) return;
			const g = merge(geos);
			this.listGeometries.push(g);
			const mesh = new Mesh(g, material);
			mesh.castShadow = shadows;
			mesh.receiveShadow = shadows;
			this.listGroup.add(mesh);
		};
		add(parts.structure, m.structure);
		add(parts.painted, m.painted);
		add(parts.siding, m.siding);
		add(parts.door, m.door);
		add(parts.glass, m.glass);
		add(parts.glassLit, m.glassLit);
		add(parts.lamp, m.lamp, false);
		add(parts.thin, m.structure, false);
		const bucketMaterial = {
			structure: m.structure,
			painted: m.painted,
			siding: m.siding,
			glass: m.glass,
			door: m.door,
			lamp: m.lamp,
			thin: m.structure,
			glassLit: m.glassLit,
			beacon: m.beaconA
		} as const;
		const dishMesh = (geos: BufferGeometry[], bucket: keyof typeof bucketMaterial) => {
			const g = merge(geos);
			this.listGeometries.push(g);
			const mesh = new Mesh(g, bucketMaterial[bucket]);
			const shadows = bucket !== 'beacon' && bucket !== 'thin';
			mesh.castShadow = shadows;
			mesh.receiveShadow = shadows;
			return mesh;
		};
		for (const b of dishes) {
			const f = footprintCentre(b);
			const yaw = (b.rotation * Math.PI) / 180;
			const near = dishObject(buildDishParts('high'), dishMesh);
			const far = dishObject(buildDishParts('low'), dishMesh);
			const aim: DishAim = { azimuth: yaw, elevation: DISH_STOW };
			for (const d of [near, far]) {
				d.root.position.set(f.x, 0, f.z);
				d.setAim(aim);
				this.listGroup.add(d.root);
			}
			far.root.visible = this.dishFar;
			near.root.visible = !this.dishFar;
			this.dishes.push({ near, far, at: new Vector3(f.x, 0, f.z), aim });
		}
	}

	/**
	 * The deep-space dishes follow `target` (render space: the active vessel, or a body in the sky;
	 * null stows them), slewed in wall time (plan 234).
	 */
	trackDishes(target: Vec3 | null, dt: number): void {
		if (this.dishes.length === 0) return;
		let local: Vector3 | null = null;
		if (target) {
			local = new Vector3(
				target.x - this.root.position.x,
				target.y - this.root.position.y,
				target.z - this.root.position.z
			).applyQuaternion(this.root.quaternion.clone().invert());
		}
		for (const d of this.dishes) {
			const goal = local
				? aimOf(
						local
							.clone()
							.sub(d.at)
							.setY(local.y - DISH.axisHeight)
					)
				: null;
			d.aim = trackStep(d.aim, goal, dt);
			d.near.setAim(d.aim);
			d.far.setAim(d.aim);
		}
	}

	/** Where each dish points (plan 234, for tests and the debug overlay). */
	get dishAims(): readonly DishAim[] {
		return this.dishes.map((d) => d.aim);
	}

	/** Draw calls of the building group (journal of plan 091). */
	get buildingMeshes(): number {
		return this.listGroup.children.length;
	}

	/** The translucent box of build mode at a footprint, green when it may be placed, red when not. */
	setGhost(
		g: {
			size: { w: number; d: number };
			cell: { i: number; j: number };
			rotation: 0 | 90 | 180 | 270;
			valid: boolean;
		} | null
	): void {
		if (!g) {
			if (this.ghost) this.ghost.visible = false;
			return;
		}
		if (!this.ghost) {
			const geo = new BoxGeometry(1, 1, 1);
			geo.translate(0, 0.5, 0);
			this.ghost = new Mesh(
				geo,
				new MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false })
			);
			this.ghost.name = 'site-ghost';
			this.ghost.renderOrder = 10;
			this.root.add(this.ghost);
			this.ghostGeometry = geo;
		}
		const f = footprintCentre(g);
		this.ghost.visible = true;
		this.ghost.position.set(f.x, 0, f.z);
		this.ghost.scale.set(f.w * SITE_CELL, 12, f.d * SITE_CELL);
		(this.ghost.material as MeshBasicMaterial).color.set(g.valid ? 0x3ccf6e : 0xe2483d);
	}

	/**
	 * Where the ray (`origin`, `direction`, both in the scene's world space) meets the site's ground
	 * plane, in site metres east and north; null when it does not (looking up, or from below).
	 */
	pickPlane(origin: Vector3, direction: Vector3): { east: number; north: number } | null {
		const inv = new Matrix4().copy(this.root.matrixWorld).invert();
		const o = origin.clone().applyMatrix4(inv);
		const d = direction.clone().transformDirection(inv);
		if (Math.abs(d.y) < 1e-9) return null;
		const t = -o.y / d.y;
		if (!(t > 0)) return null;
		return { east: o.x + d.x * t, north: -(o.z + d.z * t) };
	}

	/** A site point (metres east, north and up) in the scene's world space. */
	siteToWorld(p: { east: number; north: number; up?: number }): Vector3 {
		return new Vector3(p.east, p.up ?? 0, -p.north).applyMatrix4(this.root.matrixWorld);
	}

	dispose(): void {
		for (const g of this.listGeometries) g.dispose();
		this.ghostGeometry?.dispose();
		(this.ghost?.material as MeshBasicMaterial | undefined)?.dispose();
	}
}

export class LaunchSite {
	/** Placed at the pad each frame; children are in site-local metres. */
	readonly root = new Object3D();
	private readonly radius: number;
	private siteUp: Vec3 = { x: 1, y: 0, z: 0 };
	private siteQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
	private readonly materials = siteMaterials();
	private readonly geometries: BufferGeometry[] = [];
	private readonly pineGeo = pineGeometry();
	private readonly roundGeo = roundTreeGeometry();
	private readonly bushGeo = bushGeometry();
	private readonly rockGeo = rockGeometry();
	private readonly tuftGeo = tuftGeometry();
	/** The sets that are built or being built, by budget (ADR 0055); `active` is the one in the scene. */
	private readonly sets = new Map<string, VegetationSet>();
	private readonly builds = new Map<string, Generator<void, void>>();
	private active: VegetationSet | null = null;
	private structureMeshes: Mesh[] = [];
	private readonly floods: PointLight[] = [];
	/** The swing arms (ADR 0073): each pivot turns about its vertical hinge; `armAngle` is the shared angle. */
	private readonly arms: Object3D[] = [];
	private armAngle: number | null = null;
	private seen = false;
	private readonly pad = newPadTracker();
	private readonly steam = new SiteSteam(VENTS);
	/** Staff walking about the pad (plan 341): one skinned mesh each, always drawn. */
	private readonly people = createWalkers(SITE_PEOPLE, 'space-center');
	private detailStructures = true;
	private lastLamps = 0;

	/** Site mode (ADR 0117): the buildings come from a list, not from the hard-coded layout. */
	private readonly listMode: boolean;
	/** The list buildings, roads, dishes and ghost (ADR 0321), in this site's frame. */
	readonly buildings: SiteBuildings;

	constructor(
		radius: number,
		site: { latitude: number; longitude: number },
		treeBudget: number,
		tufts = 0,
		listMode = false
	) {
		this.radius = radius;
		this.listMode = listMode;
		this.setSite(site.latitude, site.longitude);
		this.root.name = 'launch-site';
		this.buildings = new SiteBuildings(this.materials, radius);
		this.root.add(this.buildings.root);
		this.buildStructures();
		for (const m of this.people.meshes) this.root.add(m);
		this.people.pose(0);
		this.buildFloodLights();
		this.setTrees(treeBudget, tufts);
	}

	/** Moves the site to another surface point (the host launched somewhere else). */
	setSite(latitude: number, longitude: number): void {
		const axes = siteAxes(latitude, longitude);
		this.siteUp = axes.up;
		// Site-local x east, y up, z south.
		const south = scale(axes.north, -1);
		const q = new Quaternion().setFromRotationMatrix(
			new Matrix4().makeBasis(
				new Vector3(axes.east.x, axes.east.y, axes.east.z),
				new Vector3(axes.up.x, axes.up.y, axes.up.z),
				new Vector3(south.x, south.y, south.z)
			)
		);
		this.siteQuat = { x: q.x, y: q.y, z: q.z, w: q.w };
	}

	private mesh(
		parts: BufferGeometry[],
		material: MeshStandardMaterial | MeshBasicMaterial,
		shadows = true,
		parent: Object3D = this.root,
		shift?: { x: number; y: number; z: number }
	): Mesh | undefined {
		if (!parts.length) return undefined;
		const g = merge(parts);
		if (shift) g.translate(-shift.x, -shift.y, -shift.z);
		this.geometries.push(g);
		const m = new Mesh(g, material);
		m.castShadow = shadows;
		m.receiveShadow = shadows;
		parent.add(m);
		this.structureMeshes.push(m);
		return m;
	}

	/** One swing arm as a pivot at its hinge with its steel and hoses below it, in the hinge's frame. */
	private buildArm(arm: ArmParts): void {
		const pivot = new Object3D();
		pivot.name = 'site-arm';
		pivot.position.set(arm.hinge.x, arm.hinge.y, arm.hinge.z);
		this.root.add(pivot);
		this.mesh(arm.structure, this.materials.structure, true, pivot, arm.hinge);
		const thin = this.mesh(arm.thin, this.materials.structure, true, pivot, arm.hinge);
		if (thin) thin.castShadow = false;
		this.arms.push(pivot);
	}

	private buildStructures(): void {
		const m = this.materials;
		const parts = emptyParts();
		buildTower(parts);
		buildMasts(parts);
		buildTanks(parts);
		buildProps(parts);
		buildLightPoles(parts);
		buildBuildings(parts, !this.listMode);
		this.mesh(parts.structure, m.structure);
		this.mesh(parts.painted, m.painted);
		this.mesh(parts.siding, m.siding);
		this.mesh(parts.door, m.door);
		this.mesh(parts.glass, m.glass);
		this.mesh(parts.glassLit, m.glassLit);
		this.mesh(parts.lamp, m.lamp, false);
		this.mesh(
			parts.beacon.filter((_, i) => i % 2 === 0),
			m.beaconA,
			false
		);
		this.mesh(
			parts.beacon.filter((_, i) => i % 2 === 1),
			m.beaconB,
			false
		);
		for (const arm of parts.arms) this.buildArm(arm);
		const steamRoot = new Object3D();
		steamRoot.name = 'site-steam-root';
		steamRoot.add(this.steam.mesh);
		this.root.add(steamRoot);
		// Thin steel receives light but never casts: a 10 cm mast would paint a hairline across the grass.
		this.mesh(parts.thin, m.structure);
		const thin = this.root.children[this.root.children.length - 1] as Mesh | undefined;
		if (thin && parts.thin.length) thin.castShadow = false;
	}

	/** Warm point lights at the mast floodlight banks: intensity 0 by day (kept visible so no shader recompiles at dusk). */
	private buildFloodLights(): void {
		for (const p of floodLightPositions()) {
			const light = new PointLight(0xffd29a, 0, 0, 2);
			light.position.set(p.x, p.y, p.z);
			light.name = 'site-flood';
			this.floods.push(light);
			this.root.add(light);
		}
	}

	/** 0 by day to 1 at night. */
	setLamps(level: number): void {
		const k = Math.min(Math.max(level, 0), 1);
		for (const l of this.floods) l.intensity = FLOOD_LIGHT_INTENSITY * k;
		this.lastLamps = k;
	}

	/**
	 * The moving parts (ADR 0073). `vesselRender` is the active vessel's root origin in render space (null
	 * without one), `time` seconds of wall clock, `dt` the last frame's seconds. The arms follow the vessel's
	 * height above where it stood on the pad, slewed in wall time; steam vents while it stands there; the
	 * beacons blink; the lit windows glow with the floodlights.
	 */
	animate(input: {
		dt: number;
		time: number;
		vesselRender: Vec3 | null;
		/** What the deep-space dishes track, render space (plan 234); absent or null stows them. */
		dishTarget?: Vec3 | null;
	}): void {
		const m = this.materials;
		this.buildings.trackDishes(input.dishTarget ?? null, Math.min(input.dt, 0.1));
		// the vessel's place in the pad's frame: height along the pad's vertical and distance off its axis
		let up: number | null = null;
		let off = 0;
		if (input.vesselRender) {
			const q = this.root.quaternion;
			const v = new Vector3(0, 1, 0).applyQuaternion(q);
			const rel = new Vector3(
				input.vesselRender.x - this.root.position.x,
				input.vesselRender.y - this.root.position.y,
				input.vesselRender.z - this.root.position.z
			);
			up = rel.dot(v);
			off = rel.addScaledVector(v, -up).length();
		}
		const height = padHeight(this.pad, up, off);
		const target = armTarget(height);
		// The first vessel seen finds the arms where they belong (a save loaded in the air: folded, never a swing).
		if (height === null) this.seen = false;
		else if (!this.seen) {
			this.seen = true;
			this.armAngle = target;
		}
		this.armAngle = armStep(this.armAngle ?? 0, target, Math.min(input.dt, 0.1));
		for (const arm of this.arms) arm.rotation.y = -this.armAngle;
		const day = 1 - this.lastLamps;
		const tint: readonly [number, number, number] = [
			0.07 + 0.83 * day,
			0.062 + 0.86 * day,
			0.055 + 0.9 * day
		];
		this.steam.update(input.time, steamVisibility(height), tint);
		this.steam.mesh.visible = this.steam.mesh.visible && this.detailStructures;
		m.beaconA.color.setScalar(beaconLevel(input.time, 0));
		m.beaconB.color.setScalar(beaconLevel(input.time, 0.5));
		m.glassLit.emissiveIntensity = 0.9 * windowGlow(this.lastLamps);
		this.people.pose(input.time);
	}

	private static key(count: number, tufts: number): string {
		return `${count}:${tufts}`;
	}

	/**
	 * Builds one vegetation set, yielding after each layout and each instanced mesh so a caller can spread
	 * the work over idle periods (ADR 0055). Nothing here touches the scene graph.
	 */
	private *buildSet(count: number, tufts: number, set: VegetationSet): Generator<void, void> {
		const R = this.radius;
		const drop = (x: number, z: number): number =>
			R - Math.sqrt(Math.max(R * R - x * x - z * z, 0));
		const matrix = new Matrix4();
		const q = new Quaternion();
		const e = new Euler();
		const colour = new Color();
		const layout = layoutVegetation(count);
		yield;
		const make = (
			geo: BufferGeometry,
			material: MeshStandardMaterial,
			n: number,
			cast: boolean
		): InstancedMesh => {
			const mesh = new InstancedMesh(geo, material, n);
			mesh.castShadow = cast;
			mesh.receiveShadow = true;
			set.meshes.push(mesh);
			return mesh;
		};
		const finish = (mesh: InstancedMesh): void => {
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			mesh.computeBoundingSphere();
		};
		// Only trees near the pad cast shadows: the shadow box covers about 150 m around the site,
		// and submitting every far tree to the shadow pass cost more than the trees themselves.
		for (const [kind, casting] of [
			['pine', true],
			['round', true],
			['pine', false],
			['round', false]
		] as const) {
			const list = layout.trees.filter(
				(t) => t.kind === kind && Math.hypot(t.x, t.z) < SHADOW_TREE_RADIUS === casting
			);
			if (!list.length) continue;
			const mesh = make(
				kind === 'pine' ? this.pineGeo : this.roundGeo,
				kind === 'pine' ? this.materials.pine : this.materials.round,
				list.length,
				casting
			);
			list.forEach((t, i) => {
				const h = hash3(Math.round(t.x), Math.round(t.z), 1, 5);
				const sy = t.scale * (0.85 + 0.35 * h);
				const sx = t.scale * (0.9 + 0.25 * hash3(Math.round(t.x), Math.round(t.z), 2, 6));
				q.setFromEuler(e.set(0, t.yaw, 0));
				matrix.compose(new Vector3(t.x, -drop(t.x, t.z), t.z), q, new Vector3(sx, sy, sx));
				mesh.setMatrixAt(i, matrix);
				// species variation: mostly greens of different brightness, a few turning yellow
				const tone = 0.8 + 0.4 * hash3(Math.round(t.x), Math.round(t.z), 3, 7);
				const autumn = kind === 'round' && hash3(Math.round(t.x), Math.round(t.z), 4, 8) > 0.93;
				colour.setRGB(
					autumn ? tone * 1.7 : tone,
					autumn ? tone * 1.15 : tone * (0.92 + 0.2 * h),
					autumn ? tone * 0.5 : tone * 0.95
				);
				mesh.setColorAt(i, colour);
			});
			finish(mesh);
			yield;
		}
		if (layout.bushes.length) {
			const mesh = make(this.bushGeo, this.materials.bush, layout.bushes.length, true);
			layout.bushes.forEach((b, i) => {
				q.setFromEuler(e.set(0, b.yaw, 0));
				matrix.compose(
					new Vector3(b.x, -drop(b.x, b.z), b.z),
					q,
					new Vector3(b.scale, b.scale, b.scale)
				);
				mesh.setMatrixAt(i, matrix);
				const tone = 0.75 + 0.5 * hash3(Math.round(b.x), Math.round(b.z), 5, 9);
				colour.setRGB(tone, tone, tone * 0.9);
				mesh.setColorAt(i, colour);
			});
			finish(mesh);
			yield;
		}
		const rocks = make(this.rockGeo, this.materials.rock, layout.rocks.length, true);
		set.rocks.push(rocks);
		layout.rocks.forEach((r, i) => {
			q.setFromEuler(e.set(0, r.yaw, 0));
			matrix.compose(
				new Vector3(r.x, -drop(r.x, r.z) + r.scale * 0.2, r.z),
				q,
				new Vector3(r.scale, r.scale, r.scale)
			);
			rocks.setMatrixAt(i, matrix);
		});
		finish(rocks);
		yield;
		const tuftLayout = layoutTufts(tufts);
		yield;
		// one mesh per cell of a grid over the tuft disc: frustum culling drops the cells behind the camera
		for (let cell = 0; cell < TUFT_CELLS * TUFT_CELLS; cell++) {
			const list = tuftLayout.filter((t) => tuftCell(t.x, t.z) === cell);
			if (!list.length) continue;
			const mesh = make(this.tuftGeo, this.materials.tuft, list.length, false);
			set.tufts.push(mesh);
			list.forEach((t, i) => {
				q.setFromEuler(e.set(0, t.yaw, 0));
				matrix.compose(
					new Vector3(t.x, -drop(t.x, t.z), t.z),
					q,
					new Vector3(t.scale, t.scale * (0.8 + 0.5 * t.tint), t.scale)
				);
				mesh.setMatrixAt(i, matrix);
				// lush green to dry olive, matching the ground shader's grass
				colour.setRGB(0.1 + 0.12 * t.tint * t.tint, 0.21 + 0.03 * t.tint, 0.05 + 0.02 * t.tint);
				mesh.setColorAt(i, colour);
			});
			finish(mesh);
			yield;
		}
		const notTree = new Set<InstancedMesh>([...set.tufts, ...set.rocks]);
		set.trees = set.meshes.filter((m) => !notTree.has(m));
		set.ready = true;
	}

	/** The finished set for a budget: builds what `warmVegetation` has not got to. */
	private completeSet(count: number, tufts: number): VegetationSet {
		const key = LaunchSite.key(count, tufts);
		let set = this.sets.get(key);
		if (!set) {
			set = { meshes: [], tufts: [], rocks: [], trees: [], ready: false };
			this.sets.set(key, set);
			this.builds.set(key, this.buildSet(count, tufts, set));
		}
		const build = this.builds.get(key);
		if (build) {
			while (!build.next().done) {
				// run to the end (a switch to a budget that was not warmed)
			}
			this.builds.delete(key);
		}
		return set;
	}

	/**
	 * Puts the vegetation of a preset's tree and grass-tuft budget in the scene. The set is built once and
	 * kept (ADR 0055): a switch to a budget that `warmVegetation` already built only swaps meshes.
	 */
	setTrees(count: number, tufts = 0): void {
		const set = this.completeSet(count, tufts);
		if (set === this.active) return;
		for (const m of this.active?.meshes ?? []) this.root.remove(m);
		for (const m of set.meshes) this.root.add(m);
		this.active = set;
		this.setDetail(this.lastDistance);
	}

	/**
	 * Builds the vegetation of other budgets ahead of a preset switch, one mesh per call. Returns true while
	 * there is more to do, so the host calls it again in its next idle period.
	 */
	warmVegetation(budgets: readonly { trees: number; tufts: number }[]): boolean {
		for (const b of budgets) {
			const key = LaunchSite.key(b.trees, b.tufts);
			if (this.sets.get(key)?.ready) continue;
			if (!this.sets.has(key)) {
				const set: VegetationSet = { meshes: [], tufts: [], rocks: [], trees: [], ready: false };
				this.sets.set(key, set);
				this.builds.set(key, this.buildSet(b.trees, b.tufts, set));
			}
			const build = this.builds.get(key)!;
			if (build.next().done) this.builds.delete(key);
			return true;
		}
		return false;
	}

	private lastDistance = 0;

	/**
	 * Draws only what can be seen from a camera `distance` metres from the site (`siteDetail`,
	 * plan 039). Cheap to call every frame: it flips `visible` flags.
	 */
	setDetail(distance: number): void {
		this.lastDistance = distance;
		const d = siteDetail(distance);
		for (const set of this.sets.values()) {
			for (const m of set.tufts) m.visible = d.tufts;
			for (const m of set.rocks) m.visible = d.rocks;
			for (const m of set.trees) m.visible = d.trees;
		}
		for (const m of this.structureMeshes) m.visible = d.structures;
		this.detailStructures = d.structures;
		this.buildings.setDishDistance(distance);
	}

	/** Site mode (ADR 0117): draw these buildings and road cells; ignored outside site mode. */
	setBuildings(
		list: readonly SiteBuildingView[],
		roads: readonly { i: number; j: number }[]
	): void {
		if (this.listMode) this.buildings.setBuildings(list, roads);
	}

	/** Where each dish points (plan 234, for tests and the debug overlay). */
	get dishAims(): readonly DishAim[] {
		return this.buildings.dishAims;
	}

	/** Draw calls of the building group (journal of plan 091). */
	get buildingMeshes(): number {
		return this.buildings.buildingMeshes;
	}

	setGhost(g: Parameters<SiteBuildings['setGhost']>[0]): void {
		this.buildings.setGhost(g);
	}

	pickPlane(origin: Vector3, direction: Vector3): { east: number; north: number } | null {
		return this.buildings.pickPlane(origin, direction);
	}

	siteToWorld(p: { east: number; north: number; up?: number }): Vector3 {
		return this.buildings.siteToWorld(p);
	}

	/** The materials the site draws with, which another site's buildings share (ADR 0321). */
	get sharedMaterials(): SiteMaterials {
		return this.materials;
	}

	/** Puts the site on the rotating body: position in float64, orientation = body * site frame. */
	place(bodyRender: Vec3, bodyRotation: Quat): void {
		const p = add(bodyRender, rotate(bodyRotation, scale(this.siteUp, this.radius)));
		this.root.position.set(p.x, p.y, p.z);
		const q = new Quaternion(
			bodyRotation.x,
			bodyRotation.y,
			bodyRotation.z,
			bodyRotation.w
		).multiply(new Quaternion(this.siteQuat.x, this.siteQuat.y, this.siteQuat.z, this.siteQuat.w));
		this.root.quaternion.copy(q);
		this.root.updateMatrixWorld(true);
		siteTime.value = performance.now() / 1000;
	}

	dispose(): void {
		for (const g of this.geometries) g.dispose();
		for (const g of [this.pineGeo, this.roundGeo, this.bushGeo, this.rockGeo, this.tuftGeo])
			g.dispose();
		for (const set of this.sets.values()) for (const v of set.meshes) v.dispose();
		this.steam.dispose();
		this.buildings.dispose();
		for (const p of this.people.geometries) p.dispose();
		for (const m of this.people.materials) m.dispose();
		const { textures, ...mats } = this.materials;
		for (const m of Object.values(mats)) m.dispose();
		for (const t of textures) t.dispose();
	}
}
