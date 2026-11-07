/**
 * Fine detail baked into the scaled-space maps (plan 416, ADR 0375 point 3): octaves of albedo
 * variation and normal relief finer than the runtime march uses, and subtle tints for forest, desert and
 * coast, so the orbit view shows texture instead of smooth blobs. It runs once per texel in the bake,
 * after the surface function, so it costs bake time only. One formula, written twice (TSL, GLSL), over
 * the same lattice noise as the lights.
 */

/** Wavelengths (km) and salts of the fine octaves, and their weights in the albedo's variation. */
export const BAKE_FINE: readonly { km: number; salt: number; weight: number }[] = [
	{ km: 2.4, salt: 351, weight: 1.0 },
	{ km: 1.2, salt: 353, weight: 0.7 },
	{ km: 0.6, salt: 355, weight: 0.5 }
];
/** The albedo varies by this share either way at the sum of the weights' extremes. */
export const BAKE_ALBEDO_VARIATION = 0.5;
/** Tilt of the normal by the fine relief (slope per unit of the variation noise, km offset `BAKE_STEP_KM`). */
export const BAKE_NORMAL_TILT = 0.45;
export const BAKE_STEP_KM = 0.3;
/** Height (m) of the beach: sand tint at the sea's edge, gone by the second. */
export const BAKE_BEACH = [4, 40] as const;

const f = (v: number): string => v.toFixed(6);

/**
 * The GLSL: `bakeDetail(n, height, water, albedo, normal)` changes the linear albedo and the
 * body-fixed normal of a land texel in place (`noiseT` and `uR` are the planet shader's own).
 */
export const bakeDetailGLSL = /* glsl */ `
float bakeFineAt(vec3 q) {
	return ${BAKE_FINE.map((o) => `${f(o.weight)} * (noiseT(q, ${(1 / o.km).toFixed(8)}, ${o.salt}) - 0.5)`).join('\n\t\t+ ')};
}
void bakeDetail(vec3 n, float height, bool water, inout vec3 albedo, inout vec3 normal) {
	if (water) return;
	vec3 q = n * (uR / 1000.0);
	vec3 t1 = normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
	vec3 t2 = cross(n, t1);
	float v0 = bakeFineAt(q);
	float vx = bakeFineAt(q + t1 * ${f(BAKE_STEP_KM)});
	float vy = bakeFineAt(q + t2 * ${f(BAKE_STEP_KM)});
	normal = normalize(normal - (t1 * (vx - v0) + t2 * (vy - v0)) * ${f(BAKE_NORMAL_TILT)});
	albedo *= 1.0 + ${f(BAKE_ALBEDO_VARIATION)} * v0;
	float forest = smoothstep(0.0, 0.05, albedo.g - max(albedo.r, albedo.b));
	float dry = smoothstep(0.03, 0.12, albedo.r - albedo.b) * (1.0 - forest);
	albedo = mix(albedo, albedo * vec3(0.82, 1.0, 0.78), 0.45 * forest);
	albedo = mix(albedo, albedo * vec3(1.12, 0.97, 0.78), 0.5 * dry);
	float beach = 1.0 - smoothstep(${f(BAKE_BEACH[0])}, ${f(BAKE_BEACH[1])}, height);
	albedo = mix(albedo, albedo * vec3(1.15, 1.08, 0.9) + 0.02, 0.4 * beach);
}
`;

/**
 * The TSL: returns `{ albedo, normal }` for the texel at unit body-fixed direction `n` (nodes), over
 * `noise(q, freq km, salt)` the terrain lattice noise, `radius` the body radius node (m), `height`
 * metres, `water` a 0/1 node.
 */
export function bakeDetailTSL(
	T: any,
	n: any,
	radius: any,
	height: any,
	water: any,
	albedo: any,
	normal: any,
	noise: (q: any, freq: number, salt: number) => any
): { albedo: any; normal: any } {
	const { abs, cross, float, max, mix, normalize, select, smoothstep, vec3 } = T;
	const q = n.mul(radius.div(1000.0));
	const t1 = normalize(
		cross(n, select(abs(n.y).greaterThan(0.99), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0)))
	);
	const t2 = cross(n, t1);
	const fineAt = (p: any) =>
		BAKE_FINE.map((o) =>
			noise(p, 1 / o.km, o.salt)
				.sub(0.5)
				.mul(o.weight)
		).reduce((a, b) => a.add(b));
	const v0 = fineAt(q);
	const vx = fineAt(q.add(t1.mul(BAKE_STEP_KM)));
	const vy = fineAt(q.add(t2.mul(BAKE_STEP_KM)));
	const tilted = normalize(
		normal.sub(
			t1
				.mul(vx.sub(v0))
				.add(t2.mul(vy.sub(v0)))
				.mul(BAKE_NORMAL_TILT)
		)
	);
	const a0 = albedo.mul(v0.mul(BAKE_ALBEDO_VARIATION).add(1.0));
	const forest = smoothstep(0.0, 0.05, a0.y.sub(max(a0.x, a0.z)));
	const dry = smoothstep(0.03, 0.12, a0.x.sub(a0.z)).mul(float(1.0).sub(forest));
	const a1 = mix(a0, a0.mul(vec3(0.82, 1.0, 0.78)), forest.mul(0.45));
	const a2 = mix(a1, a1.mul(vec3(1.12, 0.97, 0.78)), dry.mul(0.5));
	const beach = smoothstep(BAKE_BEACH[0], BAKE_BEACH[1], height).oneMinus();
	const a3 = mix(a2, a2.mul(vec3(1.15, 1.08, 0.9)).add(0.02), beach.mul(0.4));
	const land = water.lessThan(0.5);
	return { albedo: select(land, a3, albedo), normal: select(land, tilted, normal) };
}
