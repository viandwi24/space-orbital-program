/**
 * The scaled-space bake for the WebGPU renderer (plan 364, ADR 0306): the planet's albedo (water in
 * alpha) and body-fixed normal, baked face by face from the planet pass's own `surfaceAt`.
 *
 * One atlas per map (the planet pass may sample only 16 textures): the six faces in three columns and
 * two rows, in the cube convention of the WebGL bakes and `cube-atlas.ts` (+X, -X, +Y, -Y, +Z, -Z),
 * each with a gutter baked from directions past its edge, so the mips up to `SCALED_MAX_LOD` never mix
 * two faces. A pass covers the whole atlas and keeps only its face's tile.
 */
import {
	ClampToEdgeWrapping,
	LinearFilter,
	LinearMipmapLinearFilter,
	RGBAFormat,
	RenderTarget,
	UnsignedByteType
} from 'three';
import * as TSL from 'three/tsl';
import type { QuadMesh, WebGPURenderer } from 'three/webgpu';
import {
	SCALED_GUTTER,
	SCALED_MAX_LOD,
	SCALED_PASSES_PER_FRAME,
	scaledAtlasSize
} from '../scaled-space-model.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const { abs, clamp, float, floor, min, select, texture, uniform, uv, vec2, vec3 } = T;

/** The direction of face coordinates st (the WebGL bakes' `faceDir`; |st| > 1 runs past the edge). */
export function faceDirection(face: N, st: N): N {
	return select(
		face.lessThan(0.5),
		vec3(1.0, st.y.negate(), st.x.negate()),
		select(
			face.lessThan(1.5),
			vec3(-1.0, st.y.negate(), st.x),
			select(
				face.lessThan(2.5),
				vec3(st.x, 1.0, st.y),
				select(
					face.lessThan(3.5),
					vec3(st.x, -1.0, st.y.negate()),
					select(
						face.lessThan(4.5),
						vec3(st.x, st.y.negate(), 1.0),
						vec3(st.x.negate(), st.y.negate(), -1.0)
					)
				)
			)
		)
	);
}

export class ScaledSpaceTSL {
	/** Which face and which map the bake pass writes (0 albedo, 1 normal), and the texel in metres. */
	readonly uFace = uniform(0);
	readonly uWhat = uniform(0);
	readonly uTexelM = uniform(1000);
	/** The face size and the atlas's tile (texels). */
	readonly uSize = uniform(512);
	readonly uTile = uniform(512 + 2 * SCALED_GUTTER);
	/** 1 once every face is baked: the ground reads the bake from then on. */
	readonly uOn = uniform(0);
	private readonly blank = new RenderTarget(1, 1, { depthBuffer: false });
	readonly albedo: N = texture(this.blank.texture);
	readonly normal: N = texture(this.blank.texture);
	private targets: RenderTarget[] = [];
	private size = 0;
	private key = '';
	/** The next pass: albedo faces 0 to 5, then normal faces 0 to 5; 12 when done. */
	private next = 12;

	/** Bake again at `size` when the size or what the bake reads (`key`) changed. */
	request(size: number, key: string, texelM: number): void {
		if (size === this.size && key === this.key) return;
		if (size !== this.size) {
			for (const t of this.targets) t.dispose();
			const a = scaledAtlasSize(size);
			this.targets = [0, 1].map(
				() =>
					new RenderTarget(a.width, a.height, {
						type: UnsignedByteType,
						format: RGBAFormat,
						depthBuffer: false,
						// mips allocated with the texture; three makes them after each pass
						generateMipmaps: true,
						minFilter: LinearMipmapLinearFilter,
						magFilter: LinearFilter,
						wrapS: ClampToEdgeWrapping,
						wrapT: ClampToEdgeWrapping
					})
			);
			this.uSize.value = size;
			this.uTile.value = a.tile;
		}
		this.size = size;
		this.key = key;
		this.uTexelM.value = texelM;
		this.uOn.value = 0;
		this.next = 0;
	}

	/** Whether passes are left to bake. */
	get busy(): boolean {
		return this.next < 12;
	}

	/**
	 * In the bake pass: this texel's face (the tile it lies in) and its face coordinates, past ±1 in
	 * the gutter. The pass keeps only texels whose face is `uFace`.
	 */
	bakeTexel(): { face: N; st: N } {
		const px = uv().mul(vec2(this.uTile.mul(3.0), this.uTile.mul(2.0)));
		const cell = floor(px.div(this.uTile));
		const face = cell.y.mul(3.0).add(cell.x);
		const local = px.sub(cell.mul(this.uTile)).sub(SCALED_GUTTER);
		const st = local.div(this.uSize).mul(2.0).sub(1.0);
		return { face, st };
	}

	/** Renders up to `passes` of the bake with `quad` (the planet pass's bake material). */
	step(renderer: WebGPURenderer, quad: QuadMesh, passes = SCALED_PASSES_PER_FRAME): void {
		if (this.next >= 12) return;
		const prev = renderer.getRenderTarget();
		// a pass draws one face's tile: clearing would wipe the faces already baked
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		for (let i = 0; i < passes && this.next < 12; i++, this.next++) {
			const what = this.next >= 6 ? 1 : 0;
			const face = this.next % 6;
			const target = this.targets[what]!;
			this.uFace.value = face;
			this.uWhat.value = what;
			renderer.setRenderTarget(target);
			quad.render(renderer);
		}
		renderer.setRenderTarget(prev);
		renderer.autoClear = autoClear;
		if (this.next >= 12) {
			this.albedo.value = this.targets[0]!.texture;
			this.normal.value = this.targets[1]!.texture;
			this.uOn.value = 1;
		}
	}

	/**
	 * The bake at a unit body-fixed direction n and mip level lod: albedo (water in alpha) and the
	 * normal (xyz in 0..1). An explicit level: screen derivatives are undefined where it is read.
	 */
	sample(n: N, lod: N): { albedo: N; normal: N } {
		const a = abs(n).toVar();
		const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z)).toVar();
		const isY = isX.not().and(a.y.greaterThanEqual(a.z)).toVar();
		const sx = select(
			isX,
			select(n.x.greaterThan(0.0), n.z.negate(), n.z).div(a.x),
			select(isY, n.x.div(a.y), select(n.z.greaterThan(0.0), n.x, n.x.negate()).div(a.z))
		);
		const sy = select(
			isX,
			n.y.negate().div(a.x),
			select(isY, select(n.y.greaterThan(0.0), n.z, n.z.negate()).div(a.y), n.y.negate().div(a.z))
		);
		const face = select(
			isX,
			select(n.x.greaterThan(0.0), float(0.0), float(1.0)),
			select(
				isY,
				select(n.y.greaterThan(0.0), float(2.0), float(3.0)),
				select(n.z.greaterThan(0.0), float(4.0), float(5.0))
			)
		).toVar();
		const row = floor(face.div(3.0));
		const col = face.sub(row.mul(3.0));
		const local = clamp(vec2(sx, sy), -1.0, 1.0).mul(0.5).add(0.5).mul(this.uSize).add(SCALED_GUTTER);
		const at = vec2(col, row)
			.mul(this.uTile)
			.add(local)
			.div(vec2(this.uTile.mul(3.0), this.uTile.mul(2.0)))
			.toVar();
		const l = min(lod, SCALED_MAX_LOD);
		return { albedo: texture(this.albedo, at).level(l), normal: texture(this.normal, at).level(l) };
	}

	dispose(): void {
		for (const t of this.targets) t.dispose();
		this.blank.dispose();
	}
}
