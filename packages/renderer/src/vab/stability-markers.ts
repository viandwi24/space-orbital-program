/**
 * Centre-of-mass and centre-of-pressure glyphs of the stability read-out (plan 029, ADR 0042).
 * Each glyph is one merged, vertex-coloured mesh drawn without depth test after everything else,
 * and is turned to the camera and scaled every frame so it keeps the same size on screen.
 *
 * - `com`: the classic quartered disc, two opposite quadrants light, two dark, ringed in cyan.
 * - `cop`: a triangular ring with a dot, orange.
 * - `com-empty`: a smaller hollow white ring (where the mass centre is with the tanks dry).
 * - `cot`: an accent ring with a dot, the centre of thrust of the first stage (plan 093, ADR 0148).
 * Every glyph sits on a dark halo so it reads over the white paint of a tank too.
 */
import {
	CircleGeometry,
	Color,
	Float32BufferAttribute,
	Mesh,
	MeshBasicMaterial,
	RingGeometry,
	Vector3,
	type BufferGeometry,
	type Camera
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VabMarker } from './scene-model.ts';

export type MarkerKind = VabMarker['kind'];

const scratch = new Vector3();

/** Glyph radius on screen, CSS pixels. */
export const MARKER_PIXELS: Record<MarkerKind, { normal: number; high: number }> = {
	com: { normal: 20, high: 26 },
	cop: { normal: 20, high: 26 },
	'com-empty': { normal: 9, high: 12 },
	cot: { normal: 16, high: 21 }
};

/** World radius that makes a glyph `pixels` tall at `distance` for a vertical field of view `fovDeg` over `viewHeight` pixels. */
export function markerWorldRadius(
	distance: number,
	fovDeg: number,
	viewHeight: number,
	pixels: number
): number {
	return (distance * 2 * Math.tan((fovDeg * Math.PI) / 360) * pixels) / Math.max(1, viewHeight);
}

const COLOURS = {
	halo: new Color(0x050a0f),
	cyan: new Color(0x5ccfff).multiplyScalar(1.5),
	white: new Color(0xffffff).multiplyScalar(1.6),
	navy: new Color(0x06202c),
	orange: new Color(0xff8a2a).multiplyScalar(1.5),
	// the refs accent (#3e6ae1), lifted like the others so it reads through the bloom
	accent: new Color(0x3e6ae1).multiplyScalar(1.6)
};

function paint(g: BufferGeometry, colour: Color): BufferGeometry {
	const n = g.getAttribute('position').count;
	const c = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		c[i * 3] = colour.r;
		c[i * 3 + 1] = colour.g;
		c[i * 3 + 2] = colour.b;
	}
	g.setAttribute('color', new Float32BufferAttribute(c, 3));
	// Mergeable: same attributes on every piece.
	g.deleteAttribute('uv');
	g.deleteAttribute('normal');
	return g.index ? g.toNonIndexed() : g;
}

/** z offsets keep the pieces in a fixed order without a depth test (later in the index buffer draws on top). */
function merge(pieces: BufferGeometry[]): BufferGeometry {
	const g = mergeGeometries(pieces, false);
	for (const p of pieces) p.dispose();
	if (!g) throw new Error('Marker geometry could not be merged');
	return g;
}

/** Geometry of one glyph at unit radius in the XY plane, facing +Z. */
export function createGlyphGeometry(kind: MarkerKind, thick: boolean): BufferGeometry {
	const t = thick ? 1.7 : 1;
	if (kind === 'com') {
		const pieces: BufferGeometry[] = [
			paint(new CircleGeometry(1.34, 40), COLOURS.halo),
			paint(new CircleGeometry(1, 40, 0, Math.PI / 2), COLOURS.white),
			paint(new CircleGeometry(1, 40, Math.PI, Math.PI / 2), COLOURS.white),
			paint(new CircleGeometry(1, 40, Math.PI / 2, Math.PI / 2), COLOURS.navy),
			paint(new CircleGeometry(1, 40, Math.PI * 1.5, Math.PI / 2), COLOURS.navy),
			paint(new RingGeometry(1 - 0.17 * t, 1.12, 48), COLOURS.cyan)
		];
		return merge(pieces);
	}
	if (kind === 'cop') {
		const pieces: BufferGeometry[] = [
			paint(new CircleGeometry(1.4, 3, Math.PI / 2), COLOURS.halo),
			// A triangle ring (3 theta segments) with the apex up, plus a dot at its centroid.
			paint(new RingGeometry(1 - 0.34 * t, 1.12, 3, 1, Math.PI / 2), COLOURS.orange),
			paint(new CircleGeometry(0.2 * t, 20), COLOURS.orange)
		];
		return merge(pieces);
	}
	if (kind === 'cot') {
		const pieces: BufferGeometry[] = [
			paint(new RingGeometry(0.55, 1.34, 40), COLOURS.halo),
			paint(new RingGeometry(1 - 0.24 * t, 1.08, 40), COLOURS.accent),
			paint(new CircleGeometry(0.22 * t, 20), COLOURS.accent)
		];
		return merge(pieces);
	}
	const pieces: BufferGeometry[] = [
		paint(new RingGeometry(0.62, 1.36, 40), COLOURS.halo),
		paint(new RingGeometry(1 - 0.26 * t, 1.04, 40), COLOURS.white)
	];
	return merge(pieces);
}

/** Geometry and the one material shared by all glyphs. */
export class StabilityMarkerKit {
	private readonly geometries = new Map<string, BufferGeometry>();
	readonly material = new MeshBasicMaterial({
		vertexColors: true,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false
	});
	private highContrast = false;

	setHighContrast(on: boolean): void {
		if (this.highContrast === on) return;
		this.highContrast = on;
		for (const g of this.geometries.values()) g.dispose();
		this.geometries.clear();
	}

	get high(): boolean {
		return this.highContrast;
	}

	/** A glyph mesh; its `userData.kind` tells `orient` the size. Not pickable. */
	create(marker: VabMarker): Mesh {
		const k = `${marker.kind}|${this.highContrast}`;
		let g = this.geometries.get(k);
		if (!g) {
			g = createGlyphGeometry(marker.kind, this.highContrast);
			this.geometries.set(k, g);
		}
		const mesh = new Mesh(g, this.material);
		mesh.name = `marker:${marker.kind}`;
		mesh.userData.markerKind = marker.kind;
		mesh.userData.markerKey = marker.key;
		mesh.renderOrder = 30;
		mesh.frustumCulled = false;
		mesh.raycast = () => {};
		return mesh;
	}

	/**
	 * Turns glyphs to the camera and sizes them for the current distance. The glyph's parent has no
	 * rotation (a group only translates), so the camera's quaternion is also the local one.
	 */
	orient(meshes: Iterable<Mesh>, camera: Camera, fovDeg: number, viewHeight: number): void {
		for (const m of meshes) {
			const kind = m.userData.markerKind as MarkerKind;
			const world = m.getWorldPosition(scratch);
			const distance = Math.max(0.1, world.distanceTo(camera.position));
			const px = MARKER_PIXELS[kind][this.highContrast ? 'high' : 'normal'];
			m.quaternion.copy(camera.quaternion);
			m.scale.setScalar(markerWorldRadius(distance, fovDeg, viewHeight, px));
		}
	}

	dispose(): void {
		for (const g of this.geometries.values()) g.dispose();
		this.geometries.clear();
		this.material.dispose();
	}
}
