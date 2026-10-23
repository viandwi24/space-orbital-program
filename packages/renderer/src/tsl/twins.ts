/**
 * TSL twins of the scene's GLSL materials (plan 261 Phase 4). The WebGPU renderer cannot draw a
 * `ShaderMaterial`; for each one a twin node material is built once, reading the original's
 * uniforms every frame, and swapped in for the draw (`webgpu-compat.ts`). The scene code keeps its
 * GLSL materials and stays the WebGL path's.
 *
 * A twin is found by the original's shader source (the effects share theirs from `effects/
 * shaders.ts`), so nothing in the scene has to be renamed. Twins here: the map's orbit lines
 * (`LineMaterial`), the engine plume and its nozzle sprite, the smoke and fire fields, the plasma
 * shell and wake, the exhaust trail, the ground glow, the site steam; the moons' layers and sky
 * shells (`moon.ts`).
 */
import {
	Color,
	DoubleSide,
	InstancedInterleavedBuffer,
	Vector2,
	type InstancedBufferAttribute,
	type Material,
	type Object3D,
	type ShaderMaterial
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { siteTime, type WeatherOptions, type WindOptions } from '../weathering.ts';
import {
	FIELD_VERT,
	FIRE_FRAG,
	PLUME_FRAG,
	PLUME_VERT,
	SHELL_FRAG,
	SHELL_VERT,
	SMOKE_FRAG,
	SPRITE_FRAG,
	SPRITE_VERT,
	TRAIL_FRAG,
	TRAIL_VERT
} from '../effects/shaders.ts';
import { SMOKE_NOISE_CELLS } from '../effects/smoke-noise.ts';
import type { MoonMaterialInfo } from '../moon.ts';
import { HIGHLIGHT_FRAG, HIGHLIGHT_VERT } from '../vab/highlight.ts';
import { skyShellTwin } from './moon.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Discard,
	Fn,
	If,
	abs,
	atan,
	attribute,
	cameraFar,
	cameraNear,
	cameraPosition,
	cameraProjectionMatrix,
	cameraViewMatrix,
	clamp,
	cross,
	dot,
	exp,
	float,
	floor,
	fract,
	length,
	max,
	mix,
	modelViewMatrix,
	modelWorldMatrix,
	normalView,
	normalWorld,
	normalize,
	positionGeometry,
	positionView,
	pow,
	select,
	sin,
	smoothstep,
	sqrt,
	step,
	texture,
	transformNormalToView,
	uniform,
	varying,
	vec2,
	vec3,
	vec4,
	viewZToLogarithmicDepth
} = T;

export interface Twin {
	material: Material;
	/** Copies the original's uniforms and render state into the twin; called every frame it draws. */
	sync(): void;
}

/** A twin's uniform that follows the original's uniform of the same name. */
const linker =
	(m: ShaderMaterial, syncs: (() => void)[]) =>
	(name: string): N => {
		const src = m.uniforms[name];
		// a GLSL material that shares a twinned shader without this uniform (plan 388): say which
		if (!src)
			throw new Error(`TSL twin of ${m.name || m.type}: the material has no uniform ${name}`);
		const value = src.value;
		const node =
			value instanceof Color
				? uniform(new Color().copy(value))
				: uniform(value?.clone ? value.clone() : value);
		syncs.push(() => {
			const v = m.uniforms[name]!.value;
			if (v?.isColor || v?.isVector3 || v?.isVector2 || v?.isVector4 || v?.isMatrix4)
				node.value.copy(v);
			else node.value = v;
		});
		return node;
	};

/** Copies the blending and depth state, then keeps it in step (the effects change opacity and blending rarely). */
const withState = (twin: MeshBasicNodeMaterial, m: ShaderMaterial, syncs: (() => void)[]): void => {
	const copy = (): void => {
		twin.transparent = m.transparent;
		twin.blending = m.blending;
		twin.depthWrite = m.depthWrite;
		twin.depthTest = m.depthTest;
		twin.side = m.side;
		twin.polygonOffset = m.polygonOffset;
		twin.polygonOffsetFactor = m.polygonOffsetFactor;
		twin.polygonOffsetUnits = m.polygonOffsetUnits;
	};
	copy();
	syncs.push(copy);
};

/**
 * An InstancedMesh's instance matrix as a node, stepped per instance. Handing three the mesh's own
 * attribute stepped it per vertex (a validation error and a broken frame); a buffer of our own over
 * the same array is stepped right, and is marked dirty when the original changes.
 */
const instanceMatrixOf = (
	mesh: { instanceMatrix: InstancedBufferAttribute },
	syncs: (() => void)[]
): N => {
	const src = mesh.instanceMatrix;
	const buffer = new InstancedInterleavedBuffer(src.array as Float32Array, 16, 1);
	let version = src.version;
	syncs.push(() => {
		if (src.version !== version) {
			version = src.version;
			buffer.needsUpdate = true;
		}
	});
	const col = (k: number): N => T.bufferAttribute(buffer, 'vec4', 16, k).setInstanced(true);
	return T.mat4(col(0), col(4), col(8), col(12));
};

/** The logarithmic depth of a view-space z (negative in front), as the scene's meshes write it. */
const logDepth = (viewZ: N): N => viewZToLogarithmicDepth(viewZ, cameraNear, cameraFar);

/** Value noise of `effects/shaders.ts` (hash21, vnoise). */
const hash21 = (p0: N): N => {
	const p = fract(p0.mul(vec2(123.34, 456.21))).toVar();
	p.addAssign(dot(p, p.add(45.32)));
	return fract(p.x.mul(p.y));
};
const vnoise = (p: N): N => {
	const i = floor(p);
	const f0 = fract(p);
	const f = f0
		.mul(f0)
		.mul(f0)
		.mul(f0.mul(f0.mul(6.0).sub(15.0)).add(10.0));
	return mix(
		mix(hash21(i), hash21(i.add(vec2(1.0, 0.0))), f.x),
		mix(hash21(i.add(vec2(0.0, 1.0))), hash21(i.add(vec2(1.0, 1.0))), f.x),
		f.y
	);
};

const plume = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const t = positionGeometry.y;
	const r = mix(u('uExitR'), u('uMaxR'), smoothstep(0.0, 0.5, t))
		.mul(pow(max(float(1.0).sub(t), 0.0), 0.55))
		.mul(u('uRadiusScale'));
	twin.positionNode = vec3(
		positionGeometry.x.mul(r),
		t.negate().mul(u('uLength')).mul(u('uLengthScale')),
		positionGeometry.z.mul(r)
	);
	const vN = varying(transformNormalToView(vec3(positionGeometry.x, 0.35, positionGeometry.z)));
	const vT = varying(t);
	const vAng = varying(atan(positionGeometry.z, positionGeometry.x));
	// every uniform linked here, not in the Fn: a missing one then fails when the twin is made
	const uTime = u('uTime');
	const uVacuum = u('uVacuum');
	const uLength = u('uLength');
	const uColor = u('uColor');
	const uDiamonds = u('uDiamonds');
	const uPeriod = u('uPeriod');
	const uCore = u('uCore');
	const uGain = u('uGain');
	twin.colorNode = Fn(() => {
		const facing = clamp(abs(dot(normalize(vN), normalize(positionView.negate()))), 0.0, 1.0);
		const edge = pow(facing, mix(1.5, 3.2, uVacuum));
		const along = pow(max(float(1.0).sub(vT), 0.0), mix(1.3, 2.2, uVacuum));
		const flick = sin(vT.mul(38.0).sub(uTime.mul(55.0)).add(vAng.mul(2.0)))
			.mul(sin(vAng.mul(3.0).add(uTime.mul(23.0)).add(vT.mul(9.0))))
			.mul(0.16)
			.add(0.84);
		const dia = float(1.0).add(
			uDiamonds
				.mul(1.1)
				.mul(pow(max(0.0, sin(vT.mul(uLength).mul(6.2831853).div(uPeriod))), 3.0))
				.mul(float(1.0).sub(vT))
		);
		const col = mix(uCore, uColor, smoothstep(0.0, 0.45, vT)).toVar();
		col.assign(mix(col, uColor.mul(vec3(0.55, 0.32, 0.2)), smoothstep(0.45, 1.0, vT)));
		col.assign(mix(col, col.mul(vec3(0.72, 0.86, 1.3)), uVacuum));
		const a = clamp(edge.mul(along).mul(flick).mul(dia), 0.0, 1.0);
		const gain = uGain.mul(edge.mul(edge).mul(along).mul(4.0).add(1.0));
		return vec4(col.mul(gain), a);
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

/** A quad facing the camera in view space at the object's origin; returns the view position. */
const billboard = (twin: MeshBasicNodeMaterial, centreView: N, offset: N): void => {
	const mv = vec4(centreView.xyz.add(vec3(offset, 0.0)), 1.0);
	twin.vertexNode = cameraProjectionMatrix.mul(mv);
	twin.depthNode = logDepth(varying(mv.z));
};

const sprite = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	billboard(
		twin,
		modelViewMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0)),
		positionGeometry.xy.mul(u('uSize'))
	);
	const vUv = varying(positionGeometry.xy.mul(2.0));
	const uColor = u('uColor');
	const uGain = u('uGain');
	twin.colorNode = Fn(() => {
		const d = length(vUv);
		const glow = exp(d.mul(d).mul(-3.2)).add(pow(max(float(1.0).sub(d), 0.0), 4.0).mul(0.5));
		return vec4(uColor.mul(uGain).mul(glow), clamp(glow, 0.0, 1.0).mul(step(d, 1.0)));
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

const field = (m: ShaderMaterial, kind: 'smoke' | 'fire'): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const iPos = attribute('iPos', 'vec3');
	const centre = cameraViewMatrix.mul(vec4(iPos, 1.0));
	billboard(twin, centre, positionGeometry.xy.mul(attribute('iSize', 'float')));
	const vUv = varying(positionGeometry.xy.mul(2.0));
	const vColor = varying(attribute('iColor', 'vec4'));
	const vSeed = varying(attribute('iSeed', 'float'));
	const vDepth = varying(centre.z.negate());
	if (kind === 'smoke') {
		const vSun = varying(normalize(cameraViewMatrix.mul(vec4(u('uSunWorld'), 0.0)).xyz));
		const noise = m.uniforms.uNoise!.value;
		twin.colorNode = Fn(() => {
			const d = length(vUv).toVar();
			const q = vUv.mul(2.2).add(vSeed.mul(31.0)).toVar();
			const rq = vec2(q.x.mul(0.8).add(q.y.mul(0.6)), q.x.mul(-0.6).add(q.y.mul(0.8)));
			const t0 = texture(noise, q.div(SMOKE_NOISE_CELLS)).xyz.toVar();
			const t1 = texture(noise, rq.mul(2.3).add(7.0).div(SMOKE_NOISE_CELLS)).xyz;
			const n = t0.x.mul(0.6).add(t1.x.mul(0.4));
			const shape = smoothstep(0.2, 1.0, d.add(n.sub(0.5).mul(0.8))).oneMinus();
			const near = smoothstep(1.0, 9.0, vDepth);
			const alpha = shape.mul(vColor.w).mul(near).toVar();
			If(alpha.lessThan(0.004), () => {
				Discard();
			});
			const bump = t0.yz.sub(0.5);
			const nrm = normalize(
				vec3(vUv.add(bump.mul(0.7)), sqrt(max(float(1.0).sub(d.mul(d)), 0.05)))
			);
			const lit = dot(nrm, vSun);
			const shade = mix(0.5, 1.25, smoothstep(-0.55, 0.9, lit));
			const rim = pow(float(1.0).sub(clamp(nrm.z, 0.0, 1.0)), 2.0)
				.mul(max(vSun.z.negate(), 0.0))
				.mul(0.9);
			const thick = mix(0.82, 1.0, smoothstep(0.1, 0.9, d));
			return vec4(vColor.xyz.mul(shade.mul(thick).add(rim)), alpha);
		})();
	} else {
		twin.colorNode = Fn(() => {
			const d = length(vUv);
			const n = vnoise(vUv.mul(3.0).add(vSeed.mul(13.0)))
				.mul(0.65)
				.add(vnoise(vUv.mul(7.0).sub(vSeed.mul(5.0))).mul(0.35));
			const body = smoothstep(0.1, 1.0, d.add(n.sub(0.5).mul(0.55))).oneMinus();
			const core = pow(max(float(1.0).sub(d), 0.0), 2.0);
			const col = vColor.xyz.mul(core.mul(1.4).add(0.35));
			return vec4(col.mul(body), body.mul(vColor.w));
		})();
	}
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

const shell = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const vAxial = varying(positionGeometry.y);
	const uIntensity = u('uIntensity');
	const uTint = u('uTint');
	const uSkin = u('uSkin');
	const uShock = u('uShock');
	const uTrail = u('uTrail');
	const uCondense = u('uCondense');
	const uDetail = u('uDetail');
	const uTime = u('uTime');
	const uForward = u('uForward');
	const uTip = u('uTip');
	const uLength = u('uLength');
	twin.colorNode = Fn(() => {
		const wN = normalize(normalWorld);
		const facing = clamp(
			abs(dot(normalize(normalView), normalize(positionView.negate()))),
			0.0,
			1.0
		);
		const rim = pow(float(1.0).sub(facing), 1.4);
		const windward = smoothstep(-0.25, 0.8, dot(wN, uForward));
		const flick = sin(uTime.mul(41.0).add(wN.x.mul(7.0)).add(wN.y.mul(5.0)))
			.mul(0.12)
			.add(0.88);
		const depth = clamp(uTip.sub(vAxial).div(max(uLength, 1e-3)), 0.0, 1.0);
		const tail = smoothstep(0.3, 0.8, depth).oneMinus();
		const body = mix(uSkin, uShock, smoothstep(0.25, 0.9, rim).mul(windward));
		const toTail = mix(body, uTrail, smoothstep(0.15, 0.7, depth));
		const hot = mix(toTail, mix(toTail, vec3(1.0), 0.3), smoothstep(0.55, 1.0, uIntensity));
		const high = step(1.5, uDetail);
		const lane = sin(dot(wN, vec3(23.0, 31.0, 17.0)).mul(3.0));
		const streak = smoothstep(0.82, 0.97, lane.mul(sin(vAxial.mul(2.3).sub(uTime.mul(17.0)))))
			.mul(tail.mul(0.5).oneMinus())
			.mul(windward.mul(0.6).oneMinus())
			.mul(high);
		const bow = smoothstep(0.55, 0.95, windward).mul(pow(rim, 2.0)).mul(high);
		const a = uIntensity
			.mul(windward)
			.mul(rim.mul(0.5).add(0.1))
			.mul(flick)
			.mul(tail)
			.add(uIntensity.mul(streak.mul(0.5).add(bow.mul(0.35))));
		const cold = uCondense.mul(smoothstep(0.0, 0.3, uIntensity).oneMinus());
		const band = smoothstep(0.05, 0.3, depth).mul(smoothstep(0.5, 0.85, depth).oneMinus());
		const coldA = cold
			.mul(pow(rim, 3.0).mul(0.28).mul(band.mul(0.6).add(0.4)).add(0.015))
			.mul(windward.mul(0.6).add(0.4));
		const base = mix(hot.mul(uIntensity.mul(1.2).add(0.7)), vec3(0.9, 0.95, 1.0), cold);
		const colour = base.add(
			uIntensity.mul(
				streak
					.mul(0.8)
					.mul(vec3(1.0, 0.85, 0.9))
					.add(uShock.mul(bow.mul(0.6)))
			)
		);
		return vec4(colour, clamp(a.add(coldA), 0.0, 1.0));
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

const trail = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const aCentre = attribute('aCentre', 'vec3');
	const aSide = attribute('aSide', 'float');
	const aWidth = attribute('aWidth', 'float');
	const side0 = cross(attribute('aTan', 'vec3'), cameraPosition.sub(aCentre));
	const l = length(side0);
	const side = select(l.greaterThan(1e-5), side0.div(max(l, 1e-9)), vec3(1.0, 0.0, 0.0));
	const p = aCentre.add(side.mul(aSide.mul(aWidth).mul(0.5)));
	const mv = cameraViewMatrix.mul(modelWorldMatrix.mul(vec4(p, 1.0)));
	twin.vertexNode = cameraProjectionMatrix.mul(mv);
	twin.depthNode = logDepth(varying(mv.z));
	const vSide = varying(aSide);
	const vAlpha = varying(attribute('aAlpha', 'float'));
	const vAlong = varying(attribute('aAlong', 'float'));
	const uLight = u('uLight');
	twin.colorNode = Fn(() => {
		const d = abs(vSide);
		const n = vnoise(vec2(vAlong.mul(90.0), vSide.mul(1.7).add(3.0)))
			.mul(0.6)
			.add(vnoise(vec2(vAlong.mul(260.0).add(7.0), vSide.mul(3.1))).mul(0.4));
		const edge = smoothstep(0.15, 1.0, d.add(n.sub(0.5).mul(0.7))).oneMinus();
		const core = mix(0.85, 1.0, smoothstep(0.0, 0.9, d).oneMinus());
		const col = uLight.mul(
			mix(vec3(1.0, 0.62, 0.34), vec3(0.95, 0.96, 0.98), smoothstep(0.0, 0.06, vAlong))
		);
		return vec4(col.mul(core), edge.mul(vAlpha).mul(0.6));
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

const groundGlow = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const vUv = varying(positionGeometry.xy);
	const uGain = u('uGain');
	const uColor = u('uColor');
	twin.colorNode = Fn(() => {
		const glow = pow(max(float(1.0).sub(length(vUv)), 0.0), 2.2);
		return vec4(uColor.mul(uGain).mul(glow), glow.mul(uGain.min(1.0)));
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

const siteSteam = (m: ShaderMaterial, o: Object3D): Twin | null => {
	const mesh = o as Object3D & { instanceMatrix?: unknown; isInstancedMesh?: boolean };
	if (!mesh.isInstancedMesh) return null;
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const im = instanceMatrixOf(mesh as never, syncs);
	const centre = modelViewMatrix.mul(im.mul(vec4(0.0, 0.0, 0.0, 1.0)));
	const size = length(im[0].xyz).mul(length(modelWorldMatrix[0].xyz));
	billboard(twin, centre, positionGeometry.xy.mul(size).mul(2.0));
	const vUv = varying(positionGeometry.xy.mul(2.0));
	const vAlpha = varying(attribute('aAlpha', 'float'));
	const vSeed = varying(attribute('aSeed', 'float'));
	const uTint = u('uTint');
	twin.colorNode = Fn(() => {
		const r = length(vUv).toVar();
		If(r.greaterThan(1.0), () => {
			Discard();
		});
		const a = atan(vUv.y, vUv.x);
		const lumps = sin(a.mul(3.0).add(vSeed.mul(17.0)))
			.mul(sin(a.mul(5.0).sub(vSeed.mul(9.0)).add(1.3)))
			.mul(0.22)
			.add(0.78);
		const soft = pow(clamp(float(1.0).sub(r.div(lumps)), 0.0, 1.0), 1.4);
		const grain = hash21(floor(vUv.mul(9.0)).add(vSeed))
			.mul(0.24)
			.add(0.88);
		return vec4(uTint.mul(grain.mul(0.08).add(0.92)), soft.mul(vAlpha).mul(grain));
	})();
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

/**
 * The map's orbit lines: \`LineMaterial\`'s screen-space fat line (no dashes, pixel widths), with the
 * resolution the scene gives the original. three's \`Line2NodeMaterial\` divides by the viewport,
 * which the post pipeline's scene pass does not give as the screen's: its lines came out as bands.
 */
const line = (
	m: Material & {
		color: Color;
		linewidth: number;
		opacity: number;
		resolution: { x: number; y: number };
	}
): Twin => {
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	// a segment's quad winds either way (its side follows the segment's screen direction): both drawn
	twin.side = DoubleSide;
	const uColor = uniform(new Color().copy(m.color));
	const uWidth = uniform(m.linewidth);
	const uRes = uniform(new Vector2(m.resolution.x, m.resolution.y));
	const uOpacity = uniform(m.opacity);
	const sync = (): void => {
		uColor.value.copy(m.color);
		uWidth.value = m.linewidth;
		uRes.value.set(Math.max(m.resolution.x, 1), Math.max(m.resolution.y, 1));
		uOpacity.value = m.opacity;
		twin.transparent = m.transparent;
		twin.depthTest = m.depthTest;
		twin.depthWrite = m.depthWrite;
		twin.toneMapped = m.toneMapped; // mod overlays keep their colour (plan 347)
	};
	sync();
	const start = modelViewMatrix.mul(vec4(attribute('instanceStart', 'vec3'), 1.0)).toVar();
	const end = modelViewMatrix.mul(vec4(attribute('instanceEnd', 'vec3'), 1.0)).toVar();
	// the view depth of the drawn (trimmed) end, for the logarithmic depth
	const viewZ = T.varyingProperty('float', 'vLineViewZ');
	const clip = Fn(() => {
		// a segment through the camera plane is trimmed to it (LineMaterial's trimSegment), at the plane
		// three's Line2NodeMaterial estimates for WebGPU's 0..1 clip depth: the WebGL formula put it
		// behind the camera, and the trimmed end then drew as a long stray line across the view
		const near = cameraProjectionMatrix
			.element(3)
			.element(2)
			.mul(-0.5)
			.div(cameraProjectionMatrix.element(2).element(2));
		If(start.z.lessThan(0.0).and(end.z.greaterThan(0.0)), () => {
			const a = near.sub(start.z).div(end.z.sub(start.z));
			end.assign(vec4(mix(start.xyz, end.xyz, a), end.w));
		}).ElseIf(end.z.lessThan(0.0).and(start.z.greaterThanEqual(0.0)), () => {
			const a = near.sub(end.z).div(start.z.sub(end.z));
			start.assign(vec4(mix(end.xyz, start.xyz, a), start.w));
		});
		const cs = cameraProjectionMatrix.mul(start);
		const ce = cameraProjectionMatrix.mul(end);
		const aspect = uRes.x.div(uRes.y);
		const dir0 = ce.xy.div(ce.w).sub(cs.xy.div(cs.w));
		const dirA = normalize(vec2(dir0.x.mul(aspect), dir0.y));
		const offset = vec2(dirA.y, dirA.x.negate()).toVar();
		const dir = vec2(dirA.x.div(aspect), dirA.y).toVar();
		offset.x.assign(offset.x.div(aspect));
		offset.assign(select(positionGeometry.x.lessThan(0.0), offset.negate(), offset));
		If(positionGeometry.y.lessThan(0.0), () => {
			offset.assign(offset.sub(dir));
		}).ElseIf(positionGeometry.y.greaterThan(1.0), () => {
			offset.assign(offset.add(dir));
		});
		const c = select(positionGeometry.y.lessThan(0.5), cs, ce).toVar();
		const o = offset.mul(uWidth).div(uRes.y).mul(c.w);
		// mid-range clip depth: the depth written is the logarithmic one (depthNode); a far orbit's own
		// z/w rounds past 1 in float32 against a 1e13 m far plane, and the rasterizer clipped those
		// fragments before any depth test, which drew the orbit as dashes
		viewZ.assign(c.w.negate());
		return vec4(c.xy.add(o), c.w.mul(0.5), c.w);
	})();
	twin.vertexNode = clip;
	twin.depthNode = logDepth(viewZ);
	twin.colorNode = vec4(uColor, uOpacity);
	return { material: twin, sync };
};

/** wxHash and wxNoise of \`weathering.ts\`. */
const wxHash = (p0: N): N => {
	const p = fract(p0.mul(0.3183099).add(vec3(0.1, 0.2, 0.3)))
		.mul(17.0)
		.toVar();
	return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
};
const wxNoise = (x: N): N => {
	const i = floor(x).toVar();
	const f0 = fract(x);
	const f = f0
		.mul(f0)
		.mul(float(3.0).sub(f0.mul(2.0)))
		.toVar();
	const h = (a: number, b: number, c: number): N => wxHash(i.add(vec3(a, b, c)));
	return mix(
		mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
		mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
		f.z
	);
};

/** A standard node material with the original's properties, kept in step with the ones that change. */
const standardTwin = (m: Material): { twin: MeshStandardNodeMaterial; sync(): void } => {
	const twin = new MeshStandardNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	const skip = new Set([
		'uuid',
		'id',
		'onBeforeCompile',
		'customProgramCacheKey',
		'version',
		'userData',
		'type'
	]);
	const src = m as unknown as Record<string, unknown>;
	const dst = twin as unknown as Record<string, unknown>;
	for (const key in src) if (!skip.has(key) && typeof src[key] !== 'function') dst[key] = src[key];
	const sm = m as Material & Record<string, any>;
	const sync = (): void => {
		twin.color.copy(sm.color);
		twin.emissive.copy(sm.emissive);
		twin.emissiveIntensity = sm.emissiveIntensity;
		twin.roughness = sm.roughness;
		twin.metalness = sm.metalness;
		twin.opacity = sm.opacity;
		twin.transparent = sm.transparent;
		twin.map = sm.map;
	};
	return { twin, sync };
};

/** \`weatherMaterial\`: stains, streaks, grime near the ground, optional rust, roughness variation. */
const weather = (m: Material, w: Required<WeatherOptions>): Twin => {
	const { twin, sync } = standardTwin(m);
	const sp = positionGeometry;
	const k = w.amount;
	twin.colorNode = Fn(() => {
		const mottle = wxNoise(sp.mul(0.18))
			.mul(0.6)
			.add(wxNoise(sp.mul(0.9)).mul(0.4));
		const grain = wxNoise(sp.mul(7.0)).toVar();
		const streak = wxNoise(
			vec3(sp.x.mul(2.6).add(sp.z.mul(2.2)), sp.y.mul(0.16), sp.z.mul(0.7).sub(sp.x.mul(0.5)))
		).toVar();
		const streakMask = smoothstep(0.58, 0.88, streak).mul(
			wxNoise(sp.mul(0.3).add(11.0)).mul(0.65).add(0.35)
		);
		const low = smoothstep(0.0, 3.5, sp.y).oneMinus();
		const base = T.materialColor.xyz.toVar();
		base.mulAssign(mottle.mul(0.22).add(0.88));
		base.mulAssign(grain.mul(0.1).add(0.95));
		base.assign(mix(base, base.mul(vec3(0.55, 0.52, 0.48)), streakMask.mul(0.55 * k)));
		base.assign(
			mix(
				base,
				base.mul(vec3(0.5, 0.45, 0.38)),
				low.mul(wxNoise(sp.mul(1.7)).mul(0.4).add(0.4)).mul(k)
			)
		);
		if (w.rust) {
			const rust = smoothstep(0.66, 0.86, wxNoise(sp.mul(0.95).add(3.0))).mul(
				streak.mul(0.6).add(0.4)
			);
			base.assign(
				mix(base, vec3(0.2, 0.085, 0.04).mul(grain.mul(0.4).add(0.8)), rust.mul(0.6 * k))
			);
		}
		return vec4(base, T.materialColor.w);
	})();
	twin.roughnessNode = clamp(
		T.materialRoughness
			.add(wxNoise(sp.mul(2.3)).sub(0.5).mul(0.2))
			.add(smoothstep(0.0, 2.0, sp.y).oneMinus().mul(0.12)),
		0.05,
		1.0
	);
	return { material: twin, sync };
};

/** \`windMaterial\`: foliage and grass bend with height, phased by the instance's origin. */
const wind = (m: Material, o: Object3D, w: WindOptions): Twin => {
	const { twin, sync: syncBase } = standardTwin(m);
	const uTime = uniform(siteTime.value);
	const extra: (() => void)[] = [];
	const sync = (): void => {
		syncBase();
		uTime.value = siteTime.value;
		for (const s of extra) s();
	};
	const inst = o as Object3D & {
		isInstancedMesh?: boolean;
		instanceMatrix?: InstancedBufferAttribute;
	};
	const origin = inst.isInstancedMesh ? instanceMatrixOf(inst as never, extra)[3].xyz : vec3(0.0);
	const hh = clamp(positionGeometry.y.div(w.height), 0.0, 1.0);
	const phase = origin.x.mul(0.23).add(origin.z.mul(0.19));
	const gust = sin(uTime.mul(1.1).add(phase))
		.mul(0.6)
		.add(sin(uTime.mul(2.7).add(phase.mul(1.7))).mul(0.25))
		.add(0.35);
	const bend = hh
		.mul(hh)
		.mul(w.height * w.strength)
		.mul(gust);
	// positionNode comes after the instance transform: bend in the mesh's frame, around the instance origin
	let p: N = T.positionLocal.add(
		vec3(bend, 0.0, bend.mul(0.45).mul(sin(uTime.mul(0.7).add(phase))))
	);
	if (w.fade) {
		const k = smoothstep(
			w.fade[0],
			w.fade[1],
			T.distance(modelWorldMatrix.mul(vec4(origin, 1.0)).xyz, cameraPosition)
		).oneMinus();
		p = origin.add(p.sub(origin).mul(k));
	}
	twin.positionNode = p;
	if (w.leaves) {
		const lp = positionGeometry;
		const lf = wxNoise(lp.mul(5.5))
			.mul(0.55)
			.add(wxNoise(lp.mul(13.0)).mul(0.45));
		const sp = smoothstep(0.62, 0.8, wxNoise(lp.mul(21.0)));
		twin.colorNode = vec4(
			T.materialColor.xyz.mul(lf.mul(0.8).add(0.62)).mul(sp.mul(0.35).add(1.0)),
			T.materialColor.w
		);
	}
	return { material: twin, sync };
};

/** The part highlight's additive rim (\`vab/highlight.ts\`, plan 111). */
const highlight = (m: ShaderMaterial): Twin => {
	const syncs: (() => void)[] = [];
	const u = linker(m, syncs);
	const twin = new MeshBasicNodeMaterial();
	twin.name = `twin-${m.name || m.type}`;
	withState(twin, m, syncs);
	const f = pow(
		max(abs(dot(normalize(normalView), normalize(positionView.negate()))).oneMinus(), 0.0),
		u('uPower')
	);
	const p = sin(u('uTime').mul(4.0)).mul(u('uPulse')).add(1.0);
	twin.colorNode = vec4(
		u('uColor')
			.mul(f.mul(u('uRim')).add(u('uBase')))
			.mul(p),
		1.0
	);
	twin.fog = false;
	return { material: twin, sync: () => syncs.forEach((s) => s()) };
};

/** Builds and caches the twin of a material, or null when it has none (the mesh is then hidden). */
export class Twins {
	constructor(
		/** The twin of a moon layer (`userData.moon`, `tsl/moon.ts`), from the renderer that bakes the moons. */
		private readonly moonTwin: (info: MoonMaterialInfo) => Twin | null = () => null
	) {}

	private readonly cache = new WeakMap<Material, Twin | null>();
	/** Twins that read their mesh (its instance matrices): one per mesh, as meshes share materials. */
	private readonly perObject = new WeakMap<Object3D, Twin | null>();

	twinOf(m: Material, o: Object3D): Twin | null {
		const byObject =
			(m.userData as { wind?: unknown }).wind !== undefined || o.name === 'site-steam';
		const cache = byObject ? this.perObject : this.cache;
		const key = (byObject ? o : m) as Material & Object3D;
		let t = cache.get(key);
		if (t === undefined) {
			t = this.make(m, o);
			cache.set(key, t);
		}
		return t;
	}

	private make(m: Material, o: Object3D): Twin | null {
		const sm = m as ShaderMaterial & { isLineMaterial?: boolean };
		if (sm.isLineMaterial) return line(sm as never);
		const ud = m.userData as {
			weather?: Required<WeatherOptions>;
			wind?: WindOptions;
			moon?: MoonMaterialInfo;
		};
		if (ud.moon) return this.moonTwin(ud.moon);
		if (o.name === 'sky-shell' && sm.isShaderMaterial) return skyShellTwin(sm);
		if ((m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) {
			if (ud.weather) return weather(m, ud.weather);
			if (ud.wind) return wind(m, o, ud.wind);
			return null;
		}
		const v = sm.vertexShader;
		const f = sm.fragmentShader;
		if (v === PLUME_VERT && f === PLUME_FRAG) return plume(sm);
		if (v === SPRITE_VERT && f === SPRITE_FRAG) return sprite(sm);
		if (v === FIELD_VERT && f === SMOKE_FRAG) return field(sm, 'smoke');
		if (v === FIELD_VERT && f === FIRE_FRAG) return field(sm, 'fire');
		if (v === SHELL_VERT && f === SHELL_FRAG) return shell(sm);
		if (v === TRAIL_VERT && f === TRAIL_FRAG) return trail(sm);
		if (v === HIGHLIGHT_VERT && f === HIGHLIGHT_FRAG) return highlight(sm);
		if (o.parent?.name === 'ground-glow') return groundGlow(sm);
		if (o.name === 'site-steam') return siteSteam(sm, o);
		return null;
	}
}
