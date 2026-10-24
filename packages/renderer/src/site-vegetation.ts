/**
 * Procedural vegetation geometry for the launch site (plan 025): displaced blob canopies with a
 * light-to-dark gradient, tiered pines, shrubs, rocks and grass tufts. Vertex colours are linear;
 * `LaunchSite` tints each instance. Height `y` is up, the origin is the base.
 */
import { BufferAttribute, BufferGeometry, ConeGeometry, IcosahedronGeometry } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3 } from './noise.ts';
import { coloured, cylinder, lin, merge, type Rgb } from './site-geo.ts';

/** Radially displaces a blob's vertices and shades them: dark toward the base and the centre. */
function canopyBlob(
	cx: number,
	cy: number,
	cz: number,
	radius: number,
	base: Rgb,
	seed: number,
	detail = 1,
	squash = 0.85
): BufferGeometry {
	const g = new IcosahedronGeometry(radius, detail);
	const p = g.getAttribute('position');
	const colour = new Float32Array(p.count * 3);
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i);
		const y = p.getY(i);
		const z = p.getZ(i);
		const len = Math.hypot(x, y, z) || 1;
		// the same displacement for vertices that share a position (no cracks)
		const k =
			0.78 +
			0.44 *
				hash3(
					Math.round((x / len) * 40),
					Math.round((y / len) * 40),
					Math.round((z / len) * 40),
					seed
				);
		p.setXYZ(i, x * k, y * k * squash, z * k);
		const up = (y / len) * 0.5 + 0.5;
		const light = 0.5 + 0.75 * up * up + 0.2 * (k - 0.78) * 2;
		colour[i * 3] = base[0] * light;
		colour[i * 3 + 1] = base[1] * light;
		colour[i * 3 + 2] = base[2] * light;
	}
	g.setAttribute('color', new BufferAttribute(colour, 3));
	g.translate(cx, cy, cz);
	// shared positions become shared vertices again so the normals come out smooth
	g.deleteAttribute('normal');
	g.deleteAttribute('uv');
	const smooth = mergeVertices(g, 1e-4);
	g.dispose();
	smooth.computeVertexNormals();
	return smooth;
}

export function roundTreeGeometry(): BufferGeometry {
	const trunk = lin(0x4d3a28);
	const leaf: Rgb = lin(0x3c6b2b);
	const leafB: Rgb = lin(0x4a7a30);
	const parts: BufferGeometry[] = [
		cylinder(0.16, 0.34, 3.4, 0, 1.7, 0, trunk, 7),
		cylinder(0.08, 0.14, 2.2, 0.55, 3.6, 0.1, trunk, 5),
		canopyBlob(0, 5.1, 0, 2.5, leaf, 8),
		canopyBlob(1.5, 4.5, 0.5, 1.8, leafB, 9),
		canopyBlob(-1.4, 4.7, -0.7, 1.9, leaf, 10),
		canopyBlob(0.3, 6.5, -0.3, 1.6, leafB, 11),
		canopyBlob(-0.5, 4.2, 1.5, 1.5, leaf, 12)
	];
	return merge(parts);
}

export function pineGeometry(): BufferGeometry {
	const trunk = lin(0x45301f);
	const needles: Rgb[] = [lin(0x1b3a1d), lin(0x234a25), lin(0x2b5a2d)];
	const parts: BufferGeometry[] = [cylinder(0.16, 0.3, 2.6, 0, 1.3, 0, trunk, 6)];
	for (let i = 0; i < 5; i++) {
		const r = 2.2 - i * 0.4;
		const c = new ConeGeometry(r, 3.0 - i * 0.2, 10, 1, true).toNonIndexed();
		const p = c.getAttribute('position');
		const col = new Float32Array(p.count * 3);
		const base = needles[i % 3]!;
		for (let v = 0; v < p.count; v++) {
			const y = p.getY(v);
			const x = p.getX(v);
			const z = p.getZ(v);
			const t = y > 0 ? 1 : 0; // apex vs rim
			// ragged rim: pull alternating rim vertices in and down
			const j = hash3(Math.round(x * 30), Math.round(z * 30), i, 21);
			if (!t) p.setXYZ(v, x * (0.82 + 0.3 * j), y - 0.25 * j, z * (0.82 + 0.3 * j));
			const shade = t ? 1.15 : 0.55 + 0.25 * j;
			col[v * 3] = base[0] * shade;
			col[v * 3 + 1] = base[1] * shade;
			col[v * 3 + 2] = base[2] * shade;
		}
		c.setAttribute('color', new BufferAttribute(col, 3));
		c.translate(0, 2.7 + i * 1.55, 0);
		c.computeVertexNormals();
		parts.push(c);
	}
	return merge(parts);
}

/** The round tree for the distance (plan 414): the trunk and three coarse blobs, about a fifth of the triangles. */
export function roundTreeGeometryLow(): BufferGeometry {
	const trunk = lin(0x4d3a28);
	const leaf: Rgb = lin(0x3c6b2b);
	const leafB: Rgb = lin(0x4a7a30);
	return merge([
		cylinder(0.2, 0.34, 3.4, 0, 1.7, 0, trunk, 5),
		canopyBlob(0, 5.1, 0, 2.5, leaf, 8, 1),
		canopyBlob(1.2, 4.6, 0.4, 1.9, leafB, 9, 0),
		canopyBlob(-1.1, 5.0, -0.5, 1.9, leaf, 10, 0)
	]);
}

/** The pine for the distance: three cones and a short trunk. */
export function pineGeometryLow(): BufferGeometry {
	const trunk = lin(0x45301f);
	const needles: Rgb[] = [lin(0x1b3a1d), lin(0x234a25), lin(0x2b5a2d)];
	const parts: BufferGeometry[] = [cylinder(0.2, 0.3, 2.6, 0, 1.3, 0, trunk, 4)];
	for (let i = 0; i < 3; i++) {
		const c = new ConeGeometry(2.2 - i * 0.6, 4.2 - i * 0.5, 6, 1, true).toNonIndexed();
		const p = c.getAttribute('position');
		const col = new Float32Array(p.count * 3);
		for (let v = 0; v < p.count; v++) {
			const shade = p.getY(v) > 0 ? 1.15 : 0.6;
			col[v * 3] = needles[i]![0] * shade;
			col[v * 3 + 1] = needles[i]![1] * shade;
			col[v * 3 + 2] = needles[i]![2] * shade;
		}
		c.setAttribute('color', new BufferAttribute(col, 3));
		c.translate(0, 3.2 + i * 2.4, 0);
		c.computeVertexNormals();
		parts.push(c);
	}
	return merge(parts);
}

/** The bush for the distance: three single-subdivision blobs. */
export function bushGeometryLow(): BufferGeometry {
	const leaf = lin(0x35602a);
	return merge([
		canopyBlob(0, 0.55, 0, 0.8, leaf, 31, 0, 0.8),
		canopyBlob(0.6, 0.4, 0.2, 0.55, lin(0x44712f), 32, 0, 0.8),
		canopyBlob(-0.5, 0.4, -0.3, 0.6, lin(0x2e5a27), 33, 0, 0.8)
	]);
}

export function bushGeometry(): BufferGeometry {
	const leaf = lin(0x35602a);
	return merge([
		canopyBlob(0, 0.55, 0, 0.8, leaf, 31, 2, 0.8),
		canopyBlob(0.6, 0.4, 0.2, 0.55, lin(0x44712f), 32, 2, 0.8),
		canopyBlob(-0.5, 0.4, -0.3, 0.6, lin(0x2e5a27), 33, 2, 0.8)
	]);
}

export function rockGeometry(): BufferGeometry {
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

/** Blades per tuft and the vertices of one blade (base pair, middle pair, tip). */
const BLADES = 9;

/**
 * One grass tuft: `BLADES` bent blades fanned around the origin, about 0.25 m tall, dark at the
 * base and light at the tip. Normals lean up so a blade is lit like the ground under it.
 */
export function tuftGeometry(lite = false): BufferGeometry {
	const positions: number[] = [];
	const normals: number[] = [];
	const colours: number[] = [];
	const index: number[] = [];
	const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: number) => {
		positions.push(x, y, z);
		const l = Math.hypot(nx, ny, nz);
		normals.push(nx / l, ny / l, nz / l);
		colours.push(c, c, c);
	};
	// the far tuft (plan 414): five single-triangle blades, a little wider, 5 triangles for 27
	const blades = lite ? 5 : BLADES;
	for (let b = 0; b < blades; b++) {
		const yaw = (b / blades) * Math.PI * 2 + 0.4 * hash3(b, 1, 2, 3);
		const lean = 0.25 + 0.35 * hash3(b, 3, 2, 1);
		const h = 0.17 + 0.16 * hash3(b, 5, 7, 1);
		const w = lite ? 0.06 : 0.034;
		const dx = Math.cos(yaw);
		const dz = Math.sin(yaw);
		const px = -dz;
		const pz = dx;
		const r0 = 0.03 + 0.05 * hash3(b, 9, 3, 2);
		const base = positions.length / 3;
		const bendMid = lean * h * 0.35;
		const bendTip = lean * h * 1.0;
		const nx = dx * 0.25;
		const nz = dz * 0.25;
		push(dx * r0 - px * w, 0, dz * r0 - pz * w, nx, 1, nz, 0.6);
		push(dx * r0 + px * w, 0, dz * r0 + pz * w, nx, 1, nz, 0.6);
		if (lite) {
			push(dx * (r0 + bendTip), h, dz * (r0 + bendTip), nx, 1, nz, 1.0);
			index.push(base, base + 1, base + 2);
			continue;
		}
		push(
			dx * (r0 + bendMid) - px * w * 0.7,
			h * 0.55,
			dz * (r0 + bendMid) - pz * w * 0.7,
			nx,
			1,
			nz,
			0.85
		);
		push(
			dx * (r0 + bendMid) + px * w * 0.7,
			h * 0.55,
			dz * (r0 + bendMid) + pz * w * 0.7,
			nx,
			1,
			nz,
			0.85
		);
		push(dx * (r0 + bendTip), h, dz * (r0 + bendTip), nx, 1, nz, 1.2);
		index.push(
			base,
			base + 1,
			base + 2,
			base + 1,
			base + 3,
			base + 2,
			base + 2,
			base + 3,
			base + 4
		);
	}
	const g = new BufferGeometry();
	g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
	g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
	g.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
	g.setIndex(index);
	return g;
}
