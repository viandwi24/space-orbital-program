/**
 * Lofted bodies (plan 356): a cross-section swept through rings along Y, for hulls that are not
 * round (the orbiter's rounded-square fuselage). The section is a superellipse whose corners reach
 * `R` at full scale, so a joint face keeps its rim at the node radius (ADR 0212) while the body
 * reads boxy. Azimuth runs from +Z toward +X: 0 is the top (+Z), pi the belly (-Z).
 */
import { BufferAttribute, BufferGeometry } from 'three';
import type { GeometryBuilder, SlotName } from '../builder.ts';

/** One ring of a loft: height, half-width and half-height scales, the centre's Z offset (in A). */
export interface LoftRing {
	y: number;
	w: number;
	h: number;
	/** The ring's centre along Z, in units of the section's half side `A`. */
	dz?: number;
}

/** The superellipse exponent: 2 is a circle, higher is squarer. */
export const SECTION_N = 4;
/** The half side `A` of the section whose corners reach `R`. */
export const sectionSide = (R: number): number => R / 2 ** (0.5 - 1 / SECTION_N);

/** The unit section's point at azimuth `a`: x, z on a superellipse of half side 1. */
export function sectionPoint(a: number): [number, number] {
	const s = Math.sin(a);
	const c = Math.cos(a);
	const f = 1 / (Math.abs(s) ** SECTION_N + Math.abs(c) ** SECTION_N) ** (1 / SECTION_N);
	return [s * f, c * f];
}

/** A point of the loft surface at ring `ring` and azimuth `a`, in the part frame. */
export function ringPoint(
	A: number,
	ring: LoftRing,
	a: number,
	scale = 1
): [number, number, number] {
	const [x, z] = sectionPoint(a);
	return [A * ring.w * x * scale, ring.y, A * ((ring.dz ?? 0) + ring.h * z * scale)];
}

export interface LoftOptions {
	/** Columns round the full turn (a partial loft uses its share). */
	segments: number;
	/** The azimuth range, rad: from `start` through `length` (the whole turn by default). */
	start?: number;
	length?: number;
	/** The section scaled about the ring's centre (an inner liner at 0.95). */
	scale?: number;
	/** Faces point toward the axis (a lining seen from inside). */
	inward?: boolean;
	/** Shifts every point (a door drawn about its hinge). */
	offset?: [number, number, number];
	/** Points farther from the axis are pulled in to this radius (a joint's node circle). */
	maxRadius?: number;
	/** The slot of the quad at azimuth `a` (mid column) between rings `j` and `j + 1`. */
	slot: (a: number, j: number) => SlotName;
}

/** Adds a loft through `rings` (bottom to top) to the builder, one geometry per slot used. */
export function loft(
	b: GeometryBuilder,
	A: number,
	rings: readonly LoftRing[],
	o: LoftOptions
): void {
	const start = o.start ?? Math.PI;
	const len = o.length ?? Math.PI * 2;
	const cols = Math.max(2, Math.round((o.segments * len) / (Math.PI * 2)));
	const [ox, oy, oz] = o.offset ?? [0, 0, 0];
	const scale = o.scale ?? 1;
	const pos: number[] = [];
	const uv: number[] = [];
	for (let j = 0; j < rings.length; j++)
		for (let i = 0; i <= cols; i++) {
			const p = ringPoint(A, rings[j]!, start + (len * i) / cols, scale);
			const d = Math.hypot(p[0], p[2]);
			if (o.maxRadius !== undefined && d > o.maxRadius) {
				p[0] *= o.maxRadius / d;
				p[2] *= o.maxRadius / d;
			}
			pos.push(p[0] + ox, p[1] + oy, p[2] + oz);
			uv.push(i / cols, j / Math.max(1, rings.length - 1));
		}
	const bySlot = new Map<SlotName, number[]>();
	for (let j = 0; j + 1 < rings.length; j++)
		for (let i = 0; i < cols; i++) {
			const slot = o.slot(start + (len * (i + 0.5)) / cols, j);
			const list = bySlot.get(slot) ?? [];
			const a = j * (cols + 1) + i;
			const c = a + cols + 1;
			// azimuth runs toward +X from +Z: (a, a+1, c) faces out going up the rings
			if (o.inward) list.push(a, c, a + 1, a + 1, c, c + 1);
			else list.push(a, a + 1, c, a + 1, c + 1, c);
			bySlot.set(slot, list);
		}
	// one indexed geometry for smooth normals, then split by slot
	const whole = new BufferGeometry();
	whole.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
	whole.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
	const all = [...bySlot.values()].flat();
	whole.setIndex(all);
	whole.computeVertexNormals();
	const normals = whole.getAttribute('normal');
	for (const [slot, idx] of bySlot) {
		const g = new BufferGeometry();
		const p = new Float32Array(idx.length * 3);
		const n = new Float32Array(idx.length * 3);
		const t = new Float32Array(idx.length * 2);
		idx.forEach((v, k) => {
			p.set([pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!], k * 3);
			n.set([normals.getX(v), normals.getY(v), normals.getZ(v)], k * 3);
			t.set([uv[v * 2]!, uv[v * 2 + 1]!], k * 2);
		});
		g.setAttribute('position', new BufferAttribute(p, 3));
		g.setAttribute('normal', new BufferAttribute(n, 3));
		g.setAttribute('uv', new BufferAttribute(t, 2));
		b.add(slot, g);
	}
	whole.dispose();
}

/** A flat cap closing a ring (a fan), facing +Y (`up`) or -Y. */
export function loftCap(
	b: GeometryBuilder,
	A: number,
	ring: LoftRing,
	slot: SlotName,
	up: boolean,
	segments: number,
	scale = 1
): void {
	const cols = Math.max(8, segments);
	const p: number[] = [];
	const cz = A * (ring.dz ?? 0);
	for (let i = 0; i < cols; i++) {
		const a0 = ringPoint(A, ring, (Math.PI * 2 * i) / cols, scale);
		const a1 = ringPoint(A, ring, (Math.PI * 2 * (i + 1)) / cols, scale);
		const [q0, q1] = up ? [a0, a1] : [a1, a0];
		p.push(0, ring.y, cz, ...q0, ...q1);
	}
	const g = new BufferGeometry();
	g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
	const n = new Float32Array(p.length);
	for (let k = 0; k < n.length; k += 3) n[k + 1] = up ? 1 : -1;
	g.setAttribute('normal', new BufferAttribute(n, 3));
	g.setAttribute('uv', new BufferAttribute(new Float32Array((p.length / 3) * 2), 2));
	b.add(slot, g);
}
