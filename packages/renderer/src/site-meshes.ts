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
	Vector3
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
import { emptyParts, merge, type Rgb } from './site-geo.ts';
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
	layoutVegetation
} from './site.ts';
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
		lamp: new MeshBasicMaterial({ vertexColors: true }),
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
	private vegetation: InstancedMesh[] = [];
	private readonly floods: PointLight[] = [];
	private treeCount = -1;
	private tuftCount = -1;

	constructor(
		radius: number,
		site: { latitude: number; longitude: number },
		treeBudget: number,
		tufts = 0
	) {
		this.radius = radius;
		this.setSite(site.latitude, site.longitude);
		this.root.name = 'launch-site';
		this.buildStructures();
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
		shadows = true
	): void {
		if (!parts.length) return;
		const g = merge(parts);
		this.geometries.push(g);
		const m = new Mesh(g, material);
		m.castShadow = shadows;
		m.receiveShadow = shadows;
		this.root.add(m);
	}

	private buildStructures(): void {
		const m = this.materials;
		const parts = emptyParts();
		buildTower(parts);
		buildMasts(parts);
		buildTanks(parts);
		buildProps(parts);
		buildLightPoles(parts);
		buildBuildings(parts);
		this.mesh(parts.structure, m.structure);
		this.mesh(parts.painted, m.painted);
		this.mesh(parts.siding, m.siding);
		this.mesh(parts.door, m.door);
		this.mesh(parts.glass, m.glass);
		this.mesh(parts.lamp, m.lamp, false);
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
	}

	/** (Re)creates the instanced vegetation for a preset's tree and grass-tuft budget. */
	setTrees(count: number, tufts = 0): void {
		if (count === this.treeCount && tufts === this.tuftCount) return;
		this.treeCount = count;
		this.tuftCount = tufts;
		for (const v of this.vegetation) {
			this.root.remove(v);
			v.dispose();
		}
		this.vegetation = [];
		const layout = layoutVegetation(count);
		const R = this.radius;
		const drop = (x: number, z: number): number =>
			R - Math.sqrt(Math.max(R * R - x * x - z * z, 0));
		const matrix = new Matrix4();
		const q = new Quaternion();
		const e = new Euler();
		const colour = new Color();
		const make = (
			geo: BufferGeometry,
			material: MeshStandardMaterial,
			n: number,
			cast: boolean
		): InstancedMesh => {
			const mesh = new InstancedMesh(geo, material, n);
			mesh.castShadow = cast;
			mesh.receiveShadow = true;
			this.root.add(mesh);
			this.vegetation.push(mesh);
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
				(t) => t.kind === kind && (Math.hypot(t.x, t.z) < SHADOW_TREE_RADIUS) === casting
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
		}
		const rocks = make(this.rockGeo, this.materials.rock, layout.rocks.length, true);
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
		const tuftLayout = layoutTufts(tufts);
		if (tuftLayout.length) {
			const mesh = make(this.tuftGeo, this.materials.tuft, tuftLayout.length, false);
			tuftLayout.forEach((t, i) => {
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
		}
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
		for (const v of this.vegetation) v.dispose();
		const { textures, ...mats } = this.materials;
		for (const m of Object.values(mats)) m.dispose();
		for (const t of textures) t.dispose();
	}
}
