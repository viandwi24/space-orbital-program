/**
 * Procedural launch site (ADR 0027): tower with swing arms, lightning masts, tanks, buildings,
 * light poles, a radar and a windsock as merged meshes, plus instanced trees and rocks. Everything
 * is built in the site frame (+x east, +y up, +z south, origin at the pad centre) under one root
 * that is placed in float64 on the CPU and turns with the body. Layout lives in `site.ts`.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DataTexture,
	IcosahedronGeometry,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	RGBAFormat,
	RepeatWrapping,
	SphereGeometry,
	SRGBColorSpace,
	UnsignedByteType,
	Vector3,
	LinearFilter,
	LinearMipmapLinearFilter,
	Euler
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3 } from './noise.ts';
import { BUILDINGS, MASTS, ROADS, TANKS, TOWER, layoutVegetation, type BoxSpec } from './site.ts';
import { siteAxes } from './sun.ts';
import { add, rotate, scale } from './vec.ts';

type Rgb = [number, number, number];

/** Geometry with a flat vertex colour (linear) so one material can colour many parts. */
function coloured(g: BufferGeometry, [r, gc, b]: Rgb): BufferGeometry {
	const n = g.getAttribute('position').count;
	const c = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		c[i * 3] = r;
		c[i * 3 + 1] = gc;
		c[i * 3 + 2] = b;
	}
	g.setAttribute('color', new BufferAttribute(c, 3));
	return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: Rgb) {
	const g = new BoxGeometry(w, h, d);
	g.translate(x, y, z);
	return coloured(g, color);
}

/** A box whose faces tile `map` at `texel` metres per repeat. */
function sidedBox(spec: BoxSpec, color: Rgb, texel = 4): BufferGeometry {
	const g = new BoxGeometry(spec.w, spec.h, spec.d);
	const uv = g.getAttribute('uv');
	// BoxGeometry face order: +x, -x, +y, -y, +z, -z, four vertices each.
	const faceSizes: [number, number][] = [
		[spec.d, spec.h],
		[spec.d, spec.h],
		[spec.w, spec.d],
		[spec.w, spec.d],
		[spec.w, spec.h],
		[spec.w, spec.h]
	];
	for (let f = 0; f < 6; f++) {
		for (let v = 0; v < 4; v++) {
			const i = f * 4 + v;
			uv.setXY(i, uv.getX(i) * (faceSizes[f]![0] / texel), uv.getY(i) * (faceSizes[f]![1] / texel));
		}
	}
	g.translate(spec.x, spec.h / 2, spec.z);
	return coloured(g, color);
}

function beam(
	ax: number,
	ay: number,
	az: number,
	bx: number,
	by: number,
	bz: number,
	thick: number,
	color: Rgb
): BufferGeometry {
	const a = new Vector3(ax, ay, az);
	const b = new Vector3(bx, by, bz);
	const len = a.distanceTo(b);
	const g = new BoxGeometry(thick, len, thick);
	const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
	g.applyMatrix4(
		new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1))
	);
	return coloured(g, color);
}

function cylinder(
	rTop: number,
	rBottom: number,
	h: number,
	x: number,
	y: number,
	z: number,
	color: Rgb,
	segments = 16
) {
	const g = new CylinderGeometry(rTop, rBottom, h, segments);
	g.translate(x, y, z);
	return coloured(g, color);
}

/** sRGB hex-ish colour to linear triple. */
const lin = (hex: number): Rgb => {
	const c = new Color(hex);
	return [c.r, c.g, c.b];
};

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

/** Corrugated metal siding with window strips, 4 m per repeat. */
function facadeTexture(windows: boolean): DataTexture {
	return pixelTexture(64, (x, y) => {
		const rib = 0.82 + 0.18 * Math.cos((x / 64) * Math.PI * 2 * 4);
		const grain = 0.94 + 0.06 * hash3(x, y, 1, 3);
		let v = rib * grain;
		if (windows && y > 18 && y < 34 && x % 16 > 2 && x % 16 < 13) {
			return [0.03 + 0.02 * hash3(x >> 4, 0, 0, 5), 0.05, 0.08];
		}
		if (y % 32 < 2) v *= 0.7;
		return [v, v, v];
	});
}

/** Rock/leaf colour noise for trees and rocks is vertex-coloured; this map is for the panel steel. */
function steelMaterials() {
	const siding = facadeTexture(false);
	const glazed = facadeTexture(true);
	return {
		structure: new MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.5 }),
		painted: new MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.55 }),
		siding: new MeshStandardMaterial({
			vertexColors: true,
			map: siding,
			metalness: 0.25,
			roughness: 0.6
		}),
		glazed: new MeshStandardMaterial({
			vertexColors: true,
			map: glazed,
			metalness: 0.2,
			roughness: 0.5
		}),
		foliage: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
		rock: new MeshStandardMaterial({
			vertexColors: true,
			roughness: 1,
			metalness: 0,
			flatShading: true
		}),
		lamp: new MeshBasicMaterial({
			color: new Color(1, 0.12, 0.08).multiplyScalar(8),
			toneMapped: true
		}),
		textures: [siding, glazed]
	};
}

function tower(): BufferGeometry[] {
	const steel = lin(0x9aa3ab);
	const red = lin(0xc4361f);
	const parts: BufferGeometry[] = [];
	const { x, z, size, height } = TOWER;
	const h = size / 2;
	const bay = 3;
	const bays = Math.floor(height / bay);
	const corners: [number, number][] = [
		[-h, -h],
		[h, -h],
		[h, h],
		[-h, h]
	];
	for (const [cx, cz] of corners)
		parts.push(box(0.4, height, 0.4, x + cx, height / 2, z + cz, steel));
	for (let i = 0; i <= bays; i++) {
		const y = i * bay;
		const rc = i % 4 === 0 ? red : steel;
		parts.push(box(size, 0.22, 0.22, x, y, z - h, rc), box(size, 0.22, 0.22, x, y, z + h, rc));
		parts.push(box(0.22, 0.22, size, x - h, y, z, rc), box(0.22, 0.22, size, x + h, y, z, rc));
		if (i < bays) {
			const y1 = y + bay;
			const flip = i % 2 === 0;
			parts.push(
				beam(x - h, y, z - h, x + h, y1, z - h, 0.14, steel),
				beam(x + h, flip ? y : y1, z + h, x - h, flip ? y1 : y, z + h, 0.14, steel),
				beam(x - h, flip ? y1 : y, z - h, x - h, flip ? y : y1, z + h, 0.14, steel),
				beam(x + h, y, z + h, x + h, y1, z - h, 0.14, steel)
			);
		}
	}
	// swing arms reaching toward the vessel, and the crane head
	for (const [ay, len] of [
		[19, 4.0],
		[12.5, 4.0],
		[6.5, 3.8]
	] as const) {
		const x0 = x - h;
		const x1 = x0 - len;
		parts.push(
			box(len, 0.35, 1.0, (x0 + x1) / 2, ay, z, red),
			box(len, 0.15, 0.15, (x0 + x1) / 2, ay + 0.9, z - 0.45, steel),
			box(len, 0.15, 0.15, (x0 + x1) / 2, ay + 0.9, z + 0.45, steel),
			beam(x0, ay, z, x1, ay + 0.9, z, 0.1, steel),
			box(0.9, 1.0, 1.3, x1 - 0.2, ay + 0.5, z, steel)
		);
	}
	parts.push(
		box(size + 0.6, 0.5, size + 0.6, x, height + 0.25, z, red),
		box(9, 0.45, 0.6, x - 2.5, height + 1.0, z, red),
		cylinder(0.05, 0.12, 6, x, height + 3.5, z, steel, 6)
	);
	// ground footing and fuel umbilical lines
	parts.push(box(size + 3.5, 0.5, size + 3.5, x, 0.25, z, lin(0x6b6e70)));
	parts.push(box(1.8, 1.0, 1.8, x + 4.4, 0.5, z + 1.2, lin(0xd8d8d0)));
	return parts;
}

function masts(): BufferGeometry[] {
	const parts: BufferGeometry[] = [];
	for (const m of MASTS) {
		const segments = 8;
		for (let i = 0; i < segments; i++) {
			const hh = m.height / segments;
			parts.push(
				cylinder(0.14, 0.2, hh, m.x, hh * (i + 0.5), m.z, i % 2 ? lin(0xe8e4dc) : lin(0xc03a22), 8)
			);
		}
		parts.push(box(1.6, 0.25, 0.25, m.x, m.height - 3, m.z, lin(0x888d90)));
	}
	return parts;
}

function tanks(): BufferGeometry[] {
	const parts: BufferGeometry[] = [];
	const white = lin(0xe6e8e8);
	const steel = lin(0x7c8286);
	for (const t of TANKS) {
		if (t.kind === 'sphere') {
			const s = new SphereGeometry(t.radius, 32, 20);
			s.translate(t.x, t.radius + 2.2, t.z);
			parts.push(coloured(s, white));
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2;
				parts.push(
					cylinder(
						0.28,
						0.3,
						t.radius + 1.6,
						t.x + Math.cos(a) * t.radius * 0.72,
						(t.radius + 1.6) / 2 + 0.2,
						t.z + Math.sin(a) * t.radius * 0.72,
						steel,
						8
					)
				);
			}
			parts.push(box(t.radius * 2.2, 0.35, 0.35, t.x, 0.6, t.z, steel));
		} else {
			parts.push(cylinder(t.radius, t.radius, t.height, t.x, t.height / 2 + 1.4, t.z, white, 32));
			const dome = new SphereGeometry(t.radius, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
			dome.translate(t.x, t.height + 1.4, t.z);
			parts.push(coloured(dome, white));
			for (let i = 0; i < 4; i++) {
				const a = (i / 4) * Math.PI * 2 + 0.4;
				parts.push(
					cylinder(
						0.25,
						0.25,
						1.6,
						t.x + Math.cos(a) * t.radius * 0.8,
						0.8,
						t.z + Math.sin(a) * t.radius * 0.8,
						steel,
						8
					)
				);
			}
			parts.push(
				cylinder(
					t.radius + 0.05,
					t.radius + 0.05,
					0.5,
					t.x,
					t.height * 0.6 + 1.4,
					t.z,
					lin(0xc03a22),
					32
				)
			);
		}
	}
	// pipes between tanks
	parts.push(box(24, 0.35, 0.35, -62, 1.1, 40, steel));
	return parts;
}

function pipesAndProps(): BufferGeometry[] {
	const parts: BufferGeometry[] = [];
	const steel = lin(0x6e7377);
	// radar tower + dish
	parts.push(cylinder(0.5, 0.9, 22, 150, 11, -135, lin(0xdcdcd8), 12));
	const dish = new SphereGeometry(4.2, 24, 10, 0, Math.PI * 2, 0, 1.0);
	dish.rotateX(Math.PI * 0.55);
	dish.translate(150, 23.5, -135);
	parts.push(coloured(dish, lin(0xe9e9e6)));
	parts.push(beam(150, 23.3, -135, 150, 26, -139, 0.1, steel));
	// windsock
	parts.push(cylinder(0.08, 0.1, 7, 32, 3.5, 20, lin(0xdddddd), 6));
	const sock = new ConeGeometry(0.55, 3.2, 10, 1, true);
	sock.rotateZ(Math.PI / 2);
	sock.translate(30.2, 6.6, 20);
	parts.push(coloured(sock, lin(0xe5601d)));
	return parts;
}

function lightPoles(): { pole: BufferGeometry[]; lamps: Vector3[] } {
	const pole: BufferGeometry[] = [];
	const lamps: Vector3[] = [];
	for (const r of ROADS.slice(0, 4)) {
		const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
		const n = Math.floor(len / 28);
		const nx = (r.bz - r.az) / len;
		const nz = -(r.bx - r.ax) / len;
		for (let i = 1; i < n; i++) {
			const t = i / n;
			const px = r.ax + (r.bx - r.ax) * t + nx * (r.width / 2 + 1.5);
			const pz = r.az + (r.bz - r.az) * t + nz * (r.width / 2 + 1.5);
			pole.push(
				cylinder(0.08, 0.12, 8, px, 4, pz, lin(0x5a5f63), 6),
				box(1.2, 0.18, 0.3, px, 8.05, pz, lin(0x5a5f63))
			);
			lamps.push(new Vector3(px, 7.9, pz));
		}
	}
	return { pole, lamps };
}

function buildingGeometry(b: BoxSpec): {
	shell: BufferGeometry;
	details: BufferGeometry[];
	glazed: boolean;
} {
	const palettes: Record<BoxSpec['kind'], Rgb> = {
		hangar: lin(0xd9dde0),
		office: lin(0xe8e4dc),
		service: lin(0xcfd3d6),
		garage: lin(0xd2c9b8)
	};
	const shell = sidedBox(b, palettes[b.kind]);
	const details: BufferGeometry[] = [];
	const dark = lin(0x2b2f33);
	const stripe = lin(0xd9a21b);
	const roof = lin(0x8c9296);
	details.push(box(b.w + 0.6, 0.5, b.d + 0.6, b.x, b.h + 0.25, b.z, roof));
	if (b.kind === 'hangar') {
		const dw = b.w * 0.44;
		const dh = b.h * 0.86;
		details.push(box(dw, dh, 0.5, b.x, dh / 2, b.z + b.d / 2 + 0.1, dark));
		for (let i = 0; i < 7; i++) {
			details.push(
				box(dw, 0.5, 0.2, b.x, dh * (i / 7) + 0.4, b.z + b.d / 2 + 0.42, i % 2 ? stripe : dark)
			);
		}
		details.push(box(b.w * 0.5, 1.2, 0.5, b.x, b.h - 1.5, b.z + b.d / 2 + 0.3, lin(0xc03a22)));
		// flag-pole style vent stacks on the roof
		for (let i = -2; i <= 2; i++)
			details.push(cylinder(0.5, 0.5, 1.8, b.x + i * 12, b.h + 1.4, b.z - 6, roof, 10));
	} else if (b.kind === 'office') {
		details.push(box(b.w * 0.18, 1.1, 0.4, b.x - b.w * 0.3, 0.55, b.z + b.d / 2 + 0.2, dark));
		details.push(cylinder(0.04, 0.06, 7, b.x + b.w * 0.35, b.h + 3.5, b.z, lin(0xdddddd), 6));
		details.push(box(3.4, 1.8, 3.4, b.x - 8, b.h + 1.4, b.z, roof));
	} else if (b.kind === 'service') {
		for (let i = -1; i <= 1; i += 2)
			details.push(box(5, 5, 0.4, b.x + i * 7, 2.5, b.z + b.d / 2 + 0.15, dark));
		details.push(box(3, 2.6, 3, b.x + 9, b.h + 1.3, b.z - 3, roof));
	} else {
		details.push(box(7, 4, 0.4, b.x, 2, b.z + b.d / 2 + 0.15, dark));
	}
	return { shell, details, glazed: b.kind === 'office' };
}

const merge = (parts: BufferGeometry[]): BufferGeometry => {
	const prepared = parts.map((p) => (p.index ? p.toNonIndexed() : p));
	for (const p of prepared) {
		if (!p.getAttribute('uv')) {
			p.setAttribute(
				'uv',
				new BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2)
			);
		}
	}
	const merged = mergeGeometries(prepared, false);
	for (const p of parts) p.dispose();
	if (!merged) throw new Error('site-meshes: could not merge geometries (attribute mismatch)');
	return merged;
};

function pine(): BufferGeometry {
	const trunk = lin(0x4a3524);
	const needles = [lin(0x1d3b1e), lin(0x234a25), lin(0x2a5a2c)];
	const parts = [cylinder(0.18, 0.28, 2.2, 0, 1.1, 0, trunk, 6)];
	for (let i = 0; i < 4; i++) {
		const r = 2.0 - i * 0.42;
		const c = new ConeGeometry(r, 3.2 - i * 0.3, 8);
		c.translate(0, 2.6 + i * 1.7, 0);
		parts.push(coloured(c, needles[i % 3]!));
	}
	return merge(parts);
}

function roundTree(): BufferGeometry {
	const trunk = lin(0x55402b);
	const parts = [cylinder(0.2, 0.32, 3.0, 0, 1.5, 0, trunk, 6)];
	const blobs: [number, number, number, number, Rgb][] = [
		[0, 4.6, 0, 2.3, lin(0x3b6a2a)],
		[1.2, 4.0, 0.4, 1.6, lin(0x44762f)],
		[-1.1, 4.3, -0.6, 1.7, lin(0x335f26)]
	];
	for (const [x, y, z, r, c] of blobs) {
		const s = new IcosahedronGeometry(r, 1);
		s.translate(x, y, z);
		parts.push(coloured(s, c));
	}
	return merge(parts);
}

function rockGeometry(): BufferGeometry {
	const g = new IcosahedronGeometry(1, 1);
	const p = g.getAttribute('position');
	for (let i = 0; i < p.count; i++) {
		const k =
			0.75 +
			0.5 *
				hash3(
					Math.round(p.getX(i) * 50),
					Math.round(p.getY(i) * 50),
					Math.round(p.getZ(i) * 50),
					8
				);
		p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
	}
	return coloured(g, lin(0x77746b));
}

export class LaunchSite {
	/** Placed at the pad each frame; children are in site-local metres. */
	readonly root = new Object3D();
	private readonly radius: number;
	private siteUp: Vec3 = { x: 1, y: 0, z: 0 };
	private siteQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
	private readonly materials = steelMaterials();
	private readonly geometries: BufferGeometry[] = [];
	private readonly pineGeo = pine();
	private readonly roundGeo = roundTree();
	private readonly rockGeo = rockGeometry();
	private trees: InstancedMesh[] = [];
	private rocks: InstancedMesh | null = null;
	private treeCount = -1;

	constructor(radius: number, site: { latitude: number; longitude: number }, treeBudget: number) {
		this.radius = radius;
		this.setSite(site.latitude, site.longitude);
		this.root.name = 'launch-site';
		this.buildStructures();
		this.setTrees(treeBudget);
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

	private mesh(parts: BufferGeometry[], material: MeshStandardMaterial): Mesh {
		const g = merge(parts);
		this.geometries.push(g);
		const m = new Mesh(g, material);
		m.castShadow = true;
		m.receiveShadow = true;
		this.root.add(m);
		return m;
	}

	private buildStructures(): void {
		const m = this.materials;
		this.mesh([...tower(), ...masts(), ...tanks(), ...pipesAndProps()], m.structure);
		const poles = lightPoles();
		this.mesh(poles.pole, m.structure);
		const lampGeo = new SphereGeometry(0.28, 8, 6);
		const lamps = new InstancedMesh(
			lampGeo,
			new MeshBasicMaterial({ color: new Color(1, 0.78, 0.45).multiplyScalar(6) }),
			poles.lamps.length
		);
		poles.lamps.forEach((p, i) =>
			lamps.setMatrixAt(i, new Matrix4().makeTranslation(p.x, p.y, p.z))
		);
		lamps.instanceMatrix.needsUpdate = true;
		this.geometries.push(lampGeo);
		this.root.add(lamps);
		// aircraft-warning lamps on the masts
		const beacons = new InstancedMesh(new SphereGeometry(0.35, 8, 6), m.lamp, MASTS.length + 1);
		MASTS.forEach((mast, i) =>
			beacons.setMatrixAt(i, new Matrix4().makeTranslation(mast.x, mast.height + 0.2, mast.z))
		);
		beacons.setMatrixAt(
			MASTS.length,
			new Matrix4().makeTranslation(TOWER.x, TOWER.height + 6.7, TOWER.z)
		);
		beacons.instanceMatrix.needsUpdate = true;
		this.root.add(beacons);

		const sided: BufferGeometry[] = [];
		const glazed: BufferGeometry[] = [];
		const details: BufferGeometry[] = [];
		for (const b of BUILDINGS) {
			const g = buildingGeometry(b);
			(g.glazed ? glazed : sided).push(g.shell);
			details.push(...g.details);
		}
		this.mesh(sided, m.siding);
		if (glazed.length) this.mesh(glazed, m.glazed);
		this.mesh(details, m.painted);
	}

	/** (Re)creates the instanced vegetation for a tree budget. */
	setTrees(count: number): void {
		if (count === this.treeCount) return;
		this.treeCount = count;
		for (const t of this.trees) {
			this.root.remove(t);
			t.dispose();
		}
		if (this.rocks) {
			this.root.remove(this.rocks);
			this.rocks.dispose();
		}
		this.trees = [];
		const layout = layoutVegetation(count);
		const R = this.radius;
		const drop = (x: number, z: number): number =>
			R - Math.sqrt(Math.max(R * R - x * x - z * z, 0));
		const matrix = new Matrix4();
		const q = new Quaternion();
		const e = new Euler();
		for (const kind of ['pine', 'round'] as const) {
			const list = layout.trees.filter((t) => t.kind === kind);
			if (!list.length) continue;
			const mesh = new InstancedMesh(
				kind === 'pine' ? this.pineGeo : this.roundGeo,
				this.materials.foliage,
				list.length
			);
			list.forEach((t, i) => {
				q.setFromEuler(e.set(0, t.yaw, 0));
				matrix.compose(
					new Vector3(t.x, -drop(t.x, t.z), t.z),
					q,
					new Vector3(t.scale, t.scale, t.scale)
				);
				mesh.setMatrixAt(i, matrix);
			});
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.root.add(mesh);
			this.trees.push(mesh);
		}
		const rocks = new InstancedMesh(this.rockGeo, this.materials.rock, layout.rocks.length);
		layout.rocks.forEach((r, i) => {
			q.setFromEuler(e.set(0, r.yaw, 0));
			matrix.compose(
				new Vector3(r.x, -drop(r.x, r.z) + r.scale * 0.2, r.z),
				q,
				new Vector3(r.scale, r.scale, r.scale)
			);
			rocks.setMatrixAt(i, matrix);
		});
		rocks.instanceMatrix.needsUpdate = true;
		rocks.computeBoundingSphere();
		rocks.castShadow = true;
		rocks.receiveShadow = true;
		this.root.add(rocks);
		this.rocks = rocks;
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
	}

	dispose(): void {
		for (const g of this.geometries) g.dispose();
		this.pineGeo.dispose();
		this.roundGeo.dispose();
		this.rockGeo.dispose();
		for (const t of this.trees) t.dispose();
		this.rocks?.dispose();
		for (const key of [
			'structure',
			'painted',
			'siding',
			'glazed',
			'foliage',
			'rock',
			'lamp'
		] as const) {
			this.materials[key].dispose();
		}
		for (const t of this.materials.textures) t.dispose();
	}
}
