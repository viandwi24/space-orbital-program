/**
 * A cube map as one 2D atlas (plan 261, ADR 0249 point 9): six face tiles side by side, each with
 * a one-texel gutter baked from directions just past its edge, so hardware filtering never mixes
 * two faces. The OpenGL cube convention (+X, -X, +Y, -Y, +Z, -Z), as the WebGL bakes.
 */
import * as TSL from 'three/tsl';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const { Fn, abs, float, floor, select, uv, vec2, vec3 } = T;

/** Width and height of the atlas for faces of `size` texels. */
export const atlasSize = (size: number): { width: number; height: number } => ({
	width: 6 * (size + 2),
	height: size + 2
});

/** In a bake pass over the atlas: the (unnormalised) direction of this texel. */
export function atlasBakeDirection(size: number): N {
	const tile = size + 2;
	const px = uv().x.mul(6 * tile);
	const face = floor(px.div(tile));
	const st = vec2(px.sub(face.mul(tile)), uv().y.mul(tile))
		.sub(1.0)
		.div(size)
		.mul(2.0)
		.sub(1.0);
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

/** The atlas coordinate of a unit direction n, `sz` texels a face (a float node). */
const atlasCoordFn = Fn(([n, sz]: N[]) => {
	const tile = sz.add(2.0);
	const a = abs(n);
	const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
	const isY = isX.not().and(a.y.greaterThanEqual(a.z));
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
	);
	return vec2(
		face
			.mul(tile)
			.add(1.0)
			.add(sx.add(1.0).mul(sz.mul(0.5)))
			.div(tile.mul(6.0)),
		sy.add(1.0).mul(sz.mul(0.5)).add(1.0).div(tile)
	);
	// one WGSL function, not its body at every lookup (plan 370: about 20 copies in the planet pass)
}).setLayout({
	name: 'orbitalAtlasCoord',
	type: 'vec2',
	inputs: [
		{ name: 'n', type: 'vec3' },
		{ name: 'sz', type: 'float' }
	]
});

/** The atlas coordinate of a unit direction n. */
export function atlasCoord(n: N, size: number | N): N {
	// a JS number bakes the size in; a uniform lets one shader read atlases of any size (plan 261)
	return atlasCoordFn(n, typeof size === 'number' ? float(size) : size);
}
