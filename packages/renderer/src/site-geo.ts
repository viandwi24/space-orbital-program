/** Small geometry helpers shared by the launch-site builders (plan 025). Colours are linear. */
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
	CylinderGeometry,
	Matrix4,
	Quaternion,
	Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Rgb = [number, number, number];

/** sRGB hex to linear triple. */
export const lin = (hex: number): Rgb => {
	const c = new Color(hex);
	return [c.r, c.g, c.b];
};

/** Geometry with a flat vertex colour (linear) so one material can colour many parts. */
export function coloured(g: BufferGeometry, [r, gc, b]: Rgb): BufferGeometry {
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

export function box(
	w: number,
	h: number,
	d: number,
	x: number,
	y: number,
	z: number,
	color: Rgb
): BufferGeometry {
	const g = new BoxGeometry(w, h, d);
	g.translate(x, y, z);
	return coloured(g, color);
}

/** A box whose faces tile a texture at `texel` metres per repeat (centred at the origin). */
export function texturedBox(
	w: number,
	h: number,
	d: number,
	color: Rgb,
	texel = 4
): BufferGeometry {
	const g = new BoxGeometry(w, h, d);
	const uv = g.getAttribute('uv');
	// BoxGeometry face order: +x, -x, +y, -y, +z, -z, four vertices each.
	const sizes: [number, number][] = [
		[d, h],
		[d, h],
		[w, d],
		[w, d],
		[w, h],
		[w, h]
	];
	for (let f = 0; f < 6; f++) {
		for (let v = 0; v < 4; v++) {
			const i = f * 4 + v;
			uv.setXY(i, (uv.getX(i) * sizes[f]![0]) / texel, (uv.getY(i) * sizes[f]![1]) / texel);
		}
	}
	return coloured(g, color);
}

/** Rotates about +Y by `yaw`, then translates: place a model built at the origin. */
export function placed(
	g: BufferGeometry,
	x: number,
	y: number,
	z: number,
	yaw = 0
): BufferGeometry {
	g.applyMatrix4(
		new Matrix4().compose(
			new Vector3(x, y, z),
			new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
			new Vector3(1, 1, 1)
		)
	);
	return g;
}

export function beam(
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

export function cylinder(
	rTop: number,
	rBottom: number,
	h: number,
	x: number,
	y: number,
	z: number,
	color: Rgb,
	segments = 16
): BufferGeometry {
	const g = new CylinderGeometry(rTop, rBottom, h, segments);
	g.translate(x, y, z);
	return coloured(g, color);
}

/** Merges geometries (made non-indexed, uv added when missing) and disposes the inputs. */
export function merge(parts: BufferGeometry[]): BufferGeometry {
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
	for (const p of prepared) p.dispose();
	if (!merged) throw new Error('site-geo: could not merge geometries (attribute mismatch)');
	return merged;
}

/** Geometry buckets by material, filled by the builders and merged once per material. */
export interface SiteParts {
	/** Weathered steel (tower, frames, tanks, poles). */
	structure: BufferGeometry[];
	/** Painted trim and plain walls. */
	painted: BufferGeometry[];
	/** Corrugated cladding (texture). */
	siding: BufferGeometry[];
	/** Reflective glass. */
	glass: BufferGeometry[];
	/** Hangar and garage door leaves (door texture). */
	door: BufferGeometry[];
	/** Emissive lamp panels. */
	lamp: BufferGeometry[];
	/** Thin steel (masts, fences, cables): never casts a shadow, so no hairline shadows cross the grass. */
	thin: BufferGeometry[];
	/** Window panes that glow at night (a fixed share of the panes, `windowIsLit`); the rest is `glass`. */
	glassLit: BufferGeometry[];
	/** Blinking red beacons (emissive, one material whose brightness follows the clock). */
	beacon: BufferGeometry[];
	/** The swing arms of the tower: each folds about its own vertical hinge (ADR 0073). */
	arms: ArmParts[];
}

/** One swing arm in site-local coordinates; `hinge` is the point it turns about (vertical axis). */
export interface ArmParts {
	hinge: { x: number; y: number; z: number };
	structure: BufferGeometry[];
	thin: BufferGeometry[];
}

export const emptyParts = (): SiteParts => ({
	structure: [],
	painted: [],
	siding: [],
	glass: [],
	door: [],
	lamp: [],
	thin: [],
	glassLit: [],
	beacon: [],
	arms: []
});
