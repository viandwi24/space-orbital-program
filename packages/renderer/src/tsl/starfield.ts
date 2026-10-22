/**
 * The night sky in TSL (plan 364, ADR 0306), the twin of `shaders/starfield.glsl.ts`: the bake of the
 * Milky Way into an octahedral half-float map, its lookup, and the catalogue stars (energy-normalised
 * Gaussians, `sky-model.ts`). Same lattice, hashes and constants as the GLSL.
 */
import {
	HalfFloatType,
	LinearFilter,
	LinearMipmapLinearFilter,
	RGBAFormat,
	RenderTarget,
	ClampToEdgeWrapping
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import {
	GALACTIC_CENTRE,
	GALACTIC_POLE,
	MILKY_WAY_RADIANCE,
	SKY_FLOOR_RADIANCE,
	STAR_CELL_MARGIN,
	STAR_FLUX0,
	STAR_LAYERS,
	STAR_PEAK_CAP,
	STAR_SIGMA_BRIGHT_MAG,
	STAR_SIGMA_EXTRA_PX,
	STAR_SIGMA_FROM_MAG,
	STAR_SIGMA_MIN_PX,
	STAR_TINTS,
	STAR_TINT_STOPS,
	skyTexelAngle
} from '../sky-model.ts';
import { hash33i, noiseF } from './noise.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	abs,
	asin,
	atan,
	clamp,
	cos,
	dot,
	exp,
	exp2,
	float,
	floor,
	int,
	ivec2,
	ivec3,
	length,
	log2,
	max,
	min,
	mix,
	normalize,
	pow,
	select,
	sin,
	smoothstep,
	tan,
	texture,
	uv,
	vec2,
	vec3,
	vec4
} = T;

const v3 = (v: readonly number[]): N => vec3(v[0], v[1], v[2]);
const GAL_E = (() => {
	const [a, b] = [GALACTIC_POLE, GALACTIC_CENTRE];
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
})();

const octEncode = (d0: N): N => {
	const d = d0.div(abs(d0.x).add(abs(d0.y)).add(abs(d0.z))).toVar();
	const sgn = vec2(
		select(d.x.greaterThanEqual(0.0), 1.0, -1.0),
		select(d.y.greaterThanEqual(0.0), 1.0, -1.0)
	);
	const folded = vec2(1.0).sub(abs(d.yx)).mul(sgn);
	return select(d.z.lessThan(0.0), folded, d.xy).mul(0.5).add(0.5);
};

const octDecode = (uv0: N): N => {
	const f = uv0.mul(2.0).sub(1.0).toVar();
	const z = float(1.0).sub(abs(f.x)).sub(abs(f.y)).toVar();
	const t = max(z.negate(), 0.0);
	const x = f.x.add(select(f.x.greaterThanEqual(0.0), t.negate(), t));
	const y = f.y.add(select(f.y.greaterThanEqual(0.0), t.negate(), t));
	return normalize(vec3(x, y, z));
};

const skyFbm = (p0: N, octaves: number): N => {
	let s: N = float(0.0);
	let p = p0;
	let a = 0.5;
	let n = 0;
	for (let i = 0; i < octaves; i++) {
		s = s.add(noiseF(p).mul(a));
		n += a;
		a *= 0.5;
		p = p.mul(2.07).add(vec3(17.3, 5.1, 11.7));
	}
	return s.div(n);
};

/** `skyMilkyWay` of the GLSL bake, line by line. */
const skyMilkyWay = Fn(([d]: N[]) => {
	const b = asin(clamp(dot(d, v3(GALACTIC_POLE)), -1.0, 1.0));
	const l = atan(dot(d, v3(GAL_E)), dot(d, v3(GALACTIC_CENTRE))).toVar();
	const bb = b.add(skyFbm(d.mul(2.2).add(3.0), 3).sub(0.5).mul(0.12)).toVar();
	const width = float(0.075).add(cos(l).mul(0.5).add(0.5).mul(0.07)).toVar();
	const disk = exp(bb.mul(bb).negate().div(width.mul(width))).toVar();
	const halo = exp(bb.mul(bb).negate().div(0.1225));
	const bulge = exp(l.mul(l).negate().div(0.1764).sub(bb.mul(bb).div(0.0256))).toVar();
	const c0 = skyFbm(d.mul(7.0).add(1.3), 6);
	const clouds = c0.mul(c0).mul(2.2).toVar();
	const fine = skyFbm(d.mul(38.0).add(7.0), 4);
	const r = float(1.0).sub(abs(skyFbm(d.mul(11.0).add(5.0), 5).mul(2.0).sub(1.0)));
	const off = bb.sub(sin(l.mul(2.0)).mul(0.012)).div(width.mul(0.45));
	const lane = smoothstep(0.55, 0.95, r).mul(exp(off.mul(off).negate()));
	const patches = smoothstep(0.5, 0.8, skyFbm(d.mul(4.0).add(9.0), 4)).mul(
		exp(bb.mul(bb).negate().div(width.mul(width).mul(1.6)))
	);
	const dust = clamp(lane.mul(0.85).add(patches.mul(0.5)), 0.0, 0.92);
	const light = disk
		.mul(clouds.add(0.25))
		.mul(fine.mul(0.5).add(0.75))
		.add(bulge.mul(clouds.mul(0.6).add(0.6)))
		.add(halo.mul(0.09))
		.mul(float(1.0).sub(dust));
	const col = mix(
		vec3(0.72, 0.8, 1.0),
		vec3(1.0, 0.84, 0.66),
		clamp(bulge.mul(1.4).add(0.15), 0.0, 1.0)
	)
		.mul(light)
		.toVar();
	const n1 = smoothstep(0.62, 0.86, skyFbm(d.mul(3.3).add(21.0), 5)).mul(
		exp(bb.mul(bb).negate().div(0.09))
	);
	const n2 = smoothstep(0.66, 0.9, skyFbm(d.mul(2.6).add(43.0), 5)).mul(
		exp(bb.mul(bb).negate().div(0.25))
	);
	col.addAssign(vec3(1.0, 0.32, 0.45).mul(n1).mul(0.22).add(vec3(0.25, 0.62, 0.78).mul(n2).mul(0.12)));
	const grain = pow(noiseF(d.mul(90.0)), 6.0).mul(disk.add(bulge.mul(0.5)));
	col.addAssign(vec3(0.9, 0.92, 1.0).mul(grain).mul(0.9));
	return col.mul(MILKY_WAY_RADIANCE).add(SKY_FLOOR_RADIANCE);
});

const starTint = (t: N): N => {
	let c: N = v3(STAR_TINTS[0]!);
	for (let i = 1; i < STAR_TINTS.length; i++) {
		const a = STAR_TINT_STOPS[i]!;
		c = mix(c, v3(STAR_TINTS[i]!), smoothstep(a - 0.04, a + 0.04, t));
	}
	return c;
};

const starSigmaPx = (mag: N): N =>
	clamp(
		float(STAR_SIGMA_FROM_MAG).sub(mag).div(STAR_SIGMA_FROM_MAG - STAR_SIGMA_BRIGHT_MAG),
		0.0,
		1.0
	)
		.mul(STAR_SIGMA_EXTRA_PX)
		.add(STAR_SIGMA_MIN_PX);

const skyFaceDirection = (face: N, st: N): N => {
	const ab = tan(st.mul(Math.PI / 4)).toVar();
	const s = select(face.mod(2.0).lessThan(0.5), 1.0, -1.0);
	return normalize(
		select(
			face.lessThan(1.5),
			vec3(s, ab.x, ab.y),
			select(face.lessThan(3.5), vec3(ab.y, s, ab.x), vec3(ab.x, ab.y, s))
		)
	);
};

/** The catalogue stars a pixel of angle px (rad) sees in direction rd (inertial). */
export const catalogueStars = Fn(([rd, px]: N[]) => {
	const a = abs(rd).toVar();
	const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z)).toVar();
	const isY = isX.not().and(a.y.greaterThanEqual(a.z)).toVar();
	const face = select(
		isX,
		select(rd.x.greaterThan(0.0), 0.0, 1.0),
		select(
			isY,
			select(rd.y.greaterThan(0.0), 2.0, 3.0),
			select(rd.z.greaterThan(0.0), 4.0, 5.0)
		)
	).toVar();
	const ab = select(
		isX,
		rd.yz.div(a.x),
		select(isY, vec2(rd.z, rd.x).div(a.y), rd.xy.div(a.z))
	);
	const st = atan(ab).mul(4 / Math.PI).toVar();
	const col = vec3(0.0).toVar();
	for (const L of STAR_LAYERS) {
		const cellAngle = Math.PI / 2 / L.cells;
		const margin = STAR_CELL_MARGIN * cellAngle;
		const span = Math.pow(10, -0.5 * (L.magFaint - L.magBright));
		const g = st.mul(0.5).add(0.5).mul(L.cells);
		const cell = min(floor(g), vec2(L.cells - 1)).toVar();
		const zSalt = int(face).mul(64).add(L.salt);
		const h = hash33i(ivec3(ivec2(cell), zSalt)).toVar();
		const sp = cell
			.add(h.xy.mul(1 - 2 * STAR_CELL_MARGIN))
			.add(STAR_CELL_MARGIN)
			.mul(2 / L.cells)
			.sub(1.0);
		const d = length(rd.sub(skyFaceDirection(face, sp)));
		const k = hash33i(ivec3(ivec2(cell), zSalt.add(1))).toVar();
		const mag = log2(k.x.mul(1 - span).add(span))
			.mul(2.0 * 0.30103)
			.add(L.magFaint)
			.toVar();
		const sig = px.mul(starSigmaPx(mag)).toVar();
		const flux = exp2(mag.mul(-1.3287712)).mul(STAR_FLUX0);
		const l = flux
			.mul(exp(d.mul(d).negate().div(sig.mul(sig).mul(2.0))))
			.div(sig.mul(sig).mul(2 * Math.PI));
		// compressed under the bloom's threshold: brighter, never bigger
		const w = float(1.0)
			.sub(exp(l.negate().div(STAR_PEAK_CAP)))
			.mul(STAR_PEAK_CAP)
			.mul(smoothstep(margin, margin * 0.6, d));
		col.addAssign(select(h.z.lessThan(L.chance), starTint(k.y).mul(w), vec3(0.0)));
	}
	return col;
});

/** The baked map (owned by `SkyMapTSL`) and the catalogue: the sky's radiance before the star visibility. */
export const skyRadiance = (map: N, texel: N, rd: N, px: N): N => {
	const lod = max(log2(px.div(texel)), 0.0);
	return texture(map, octEncode(rd)).level(lod).xyz.add(catalogueStars(rd, px));
};

/** The octahedral sky map for the WebGPU renderer, baked once per size (a few ms). */
export class SkyMapTSL {
	private target: RenderTarget | null = null;
	private size = 0;
	private readonly blank = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
	/** The node the planet pass samples; its texture is the current bake. */
	readonly node: N = texture(this.blank.texture);
	readonly texel: N = T.uniform(skyTexelAngle(1024));
	private quad: QuadMesh | null = null;
	private material: MeshBasicNodeMaterial | null = null;

	bake(renderer: WebGPURenderer, size: number): void {
		if (size === this.size) return;
		this.target?.dispose();
		this.target = new RenderTarget(size, size, {
			type: HalfFloatType,
			format: RGBAFormat,
			depthBuffer: false,
			generateMipmaps: true,
			minFilter: LinearMipmapLinearFilter,
			magFilter: LinearFilter,
			wrapS: ClampToEdgeWrapping,
			wrapT: ClampToEdgeWrapping
		});
		if (!this.quad) {
			const m = new MeshBasicNodeMaterial();
			m.name = 'sky-map-bake';
			m.fragmentNode = vec4(skyMilkyWay(octDecode(uv())), 1.0);
			m.depthTest = false;
			m.depthWrite = false;
			this.quad = new QuadMesh(m);
			this.material = m;
		}
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(this.target);
		this.quad.render(renderer);
		renderer.setRenderTarget(prev);
		this.node.value = this.target.texture;
		this.texel.value = skyTexelAngle(size);
		this.size = size;
	}

	dispose(): void {
		this.target?.dispose();
		this.blank.dispose();
		this.material?.dispose();
	}
}
