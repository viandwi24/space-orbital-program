/**
 * The models this mod ships, generated while the package is built (plan 051, ADR 0076): no binary
 * art is checked in, so there is no licence to carry. `tools/mod-build/build-mod.ts` calls the
 * default export and packs each returned file at its path; a part names a path in
 * `visual.asset`. Authoring rules: the part frame (origin at the part's centre, +Y up, metres),
 * the model fits the part's `shape`, its faces sit on the attach nodes, and a node named
 * `moving` is the piece an `articulation` turns about that node's own origin.
 */
import { buildGlb, encodePng, lathe } from '../../tools/mod-build/glb.ts';

/** A 64 x 64 panelled-metal base colour: light plates with darker seams and rivet dots. */
function panelTexture(): Uint8Array {
	const size = 64;
	const rgba = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const seam = x % 32 < 2 || y % 16 < 2;
			const rivet = (x % 32 === 6 || x % 32 === 26) && y % 16 === 8;
			const v = seam ? 120 : rivet ? 235 : 196 + ((x * 7 + y * 13) % 9);
			rgba.set([v, v, Math.min(255, v + 6), 255], (y * size + x) * 4);
		}
	}
	return encodePng(size, size, rgba);
}

/** A vacuum engine: a textured housing with a gold band, and a bell on a pivot at its base. */
function spikeEngine(): Uint8Array {
	const pivotY = -0.15;
	const housing = lathe(
		[
			[0.3, -0.15],
			[0.46, -0.1],
			[0.6, -0.04],
			[0.62, 0.02],
			[0.62, 0.42],
			[0.55, 0.5]
		],
		32,
		0,
		'housing'
	);
	const band = lathe(
		[
			[0.625, 0.14],
			[0.625, 0.24]
		],
		32,
		1,
		'band'
	);
	// A thin shell, outer wall down and inner wall back up, in the pivot's frame.
	const bell = lathe(
		(
			[
				[0.12, -0.15],
				[0.2, -0.28],
				[0.36, -0.4],
				[0.5, -0.5],
				[0.47, -0.5],
				[0.33, -0.4],
				[0.17, -0.28],
				[0.09, -0.15]
			] as const
		).map(([r, y]) => [r, y - pivotY] as const),
		32,
		2,
		'bell'
	);
	return buildGlb({
		meshes: [housing, band, bell],
		materials: [
			{ name: 'plate', color: [1, 1, 1, 1], metallic: 0.7, roughness: 0.45, texture: 0 },
			{ name: 'gold', color: [0.9, 0.6, 0.15, 1], metallic: 0.9, roughness: 0.3 },
			{ name: 'nozzle', color: [0.16, 0.17, 0.2, 1], metallic: 0.85, roughness: 0.5 }
		],
		nodes: [
			{ name: 'housing', mesh: 0 },
			{ name: 'band', mesh: 1 },
			{ name: 'moving', mesh: 2, translation: [0, pivotY, 0] }
		],
		roots: [0, 1, 2],
		images: [panelTexture()]
	});
}

export default function assets(): Record<string, Uint8Array> {
	return { 'models/spike-engine.glb': spikeEngine() };
}
