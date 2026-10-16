/**
 * The planet pass: sphere, ground, ocean, atmosphere, clouds, stars and sun in one fullscreen
 * shader (ADR 0027). Holds the GPU objects; the maths it needs lives in pure modules
 * (`planet-frame.ts`, `atmosphere-model.ts`, `sun.ts`).
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	AlwaysDepth,
	BufferAttribute,
	HalfFloatType,
	OrthographicCamera,
	Scene,
	WebGLCubeRenderTarget,
	type WebGLRenderer,
	BufferGeometry,
	ClampToEdgeWrapping,
	DataTexture,
	DepthTexture,
	LessEqualCompare,
	NearestFilter,
	DoubleSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	Matrix3,
	Matrix4,
	Mesh,
	NoColorSpace,
	RGBAFormat,
	RepeatWrapping,
	ShaderMaterial,
	Quaternion,
	UnsignedByteType,
	Vector3,
	type PerspectiveCamera,
	type Uniform
} from 'three';
import { type Atmosphere, type RGB } from './atmosphere-model.ts';
import { cachedPlanetMap } from './planet-map.ts';
import type { PlanetFrame } from './planet-frame.ts';
import type { PresetSettings } from './presets.ts';
import { CIRRUS_ALTITUDE, CLOUD_ALTITUDE } from './cloud-model.ts';
import { PAD_RADIUS } from './site.ts';
import { planetFragment, planetVertex } from './shaders/planet.glsl.ts';
import { terrainBakeFragment, terrainBakeVertex } from './shaders/terrain.glsl.ts';
import { siteAxes, surfaceUp } from './sun.ts';
import { bubbleStrength, flatSkipRadius } from './terrain-model.ts';
import { WAVES, WAVE_PERIOD, waveNumber } from './water-model.ts';

type U<T> = Uniform<T>;
const u = <T>(value: T): U<T> => ({ value }) as U<T>;

/** Atmosphere uniforms shared by every material that scatters light (planet pass, environment sky). */
export interface AtmosphereUniforms {
	uR: U<number>;
	uAtmH: U<number>;
	uBetaR: U<Vector3>;
	uBetaM: U<number>;
	uHR: U<number>;
	uHM: U<number>;
	uMieG: U<number>;
	uSunIrr: U<number>;
	uSkyBoost: U<number>;
	uMieBoost: U<number>;
}

export function createAtmosphereUniforms(atm: Atmosphere): AtmosphereUniforms {
	return {
		uR: u(atm.radius),
		uAtmH: u(atm.height),
		uBetaR: u(new Vector3(...atm.betaRayleigh)),
		uBetaM: u(atm.betaMie),
		uHR: u(atm.rayleighHeight),
		uHM: u(atm.mieHeight),
		uMieG: u(atm.mieG),
		uSunIrr: u(atm.sunIrradiance),
		uSkyBoost: u(atm.skyBoost),
		uMieBoost: u(atm.mieBoost)
	};
}

export interface PlanetUpdate {
	camera: PerspectiveCamera;
	/** Drawing-buffer height in pixels (device pixels). */
	pixelHeight: number;
	frame: PlanetFrame;
	bodyRotation: Quat;
	/** Unit vector toward the sun, inertial. */
	sun: Vec3;
	/** Unit vector toward the sun, body-fixed. */
	sunBodyFixed: Vec3;
	/** Sky irradiance at the camera (radiance already times pi) and mean sky radiance. */
	ambient: RGB;
	skyColour: RGB;
	/** Sun elevation sine at the camera (for the ambient scale). */
	ambientRefMu: number;
	/** 0 by day to 1 at night: the launch-site floodlights are on. */
	siteLamps: number;
	cloudCover: number;
	cloudAngle: number;
	/** Seconds since the environment started (the sea is periodic in `WAVE_PERIOD`). */
	time: number;
	starBrightness: number;
	shadow: {
		on: boolean;
		map: DepthTexture | null;
		matrix: Matrix4;
		bias: number;
		texel: number;
	};
}

const qMatrix3 = (q: Quat, inverse: boolean): Matrix3 =>
	new Matrix3().setFromMatrix4(
		new Matrix4().makeRotationFromQuaternion(
			new Quaternion(inverse ? -q.x : q.x, inverse ? -q.y : q.y, inverse ? -q.z : q.z, q.w)
		)
	);

export class PlanetPass {
	readonly mesh: Mesh;
	readonly material: ShaderMaterial;
	readonly atmosphere: AtmosphereUniforms;
	/**
	 * A shadow sampler must always have a depth texture with a compare mode bound; three's own
	 * empty one is never uploaded (WebGL then reports a sampler/texture mismatch and draws nothing).
	 */
	private readonly dummyShadow = (() => {
		const t = new DepthTexture(1, 1);
		t.compareFunction = LessEqualCompare;
		t.minFilter = NearestFilter;
		t.magFilter = NearestFilter;
		t.needsUpdate = true;
		return t;
	})();
	private map: DataTexture;
	private mapWidth: number;
	/** Baked terrain heights (ADR 0036): a cube map of height (m) and tangent gradient. */
	private terrainTarget: WebGLCubeRenderTarget | null = null;
	private terrainSize: number;
	private terrainDirty = true;
	private readonly bake: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial };
	private readonly radius: number;
	private siteLatitude: number;
	private siteLongitude: number;

	constructor(
		atm: Atmosphere,
		settings: PresetSettings,
		site: { latitude: number; longitude: number }
	) {
		this.radius = atm.radius;
		this.siteLatitude = site.latitude;
		this.siteLongitude = site.longitude;
		this.atmosphere = createAtmosphereUniforms(atm);
		this.mapWidth = settings.mapWidth;
		this.map = this.buildMap(settings.mapWidth);
		this.terrainSize = settings.terrainSize;
		const axes = siteAxes(site.latitude, site.longitude);
		const geometry = new BufferGeometry();
		geometry.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
		);
		this.material = new ShaderMaterial({
			name: 'planet-pass',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: this.definesFor(settings),
			uniforms: {
				...this.atmosphere,
				uInvProj: u(new Matrix4()),
				uCamRot: u(new Matrix3()),
				uCamPos: u(new Vector3()),
				uCamUp: u(new Vector3(0, 1, 0)),
				uAlt: u(1),
				uPixelAngle: u(0.001),
				uSunDir: u(new Vector3(1, 0, 0)),
				uSunBF: u(new Vector3(1, 0, 0)),
				uBodyInv: u(new Matrix3()),
				uCamLocal: u(new Vector3()),
				uAnchorCell: u(new Vector3()),
				uCamToSite: u(new Vector3()),
				uSiteEast: u(new Vector3(axes.east.x, axes.east.y, axes.east.z)),
				uSiteNorth: u(new Vector3(axes.north.x, axes.north.y, axes.north.z)),
				uSiteUp: u(new Vector3(axes.up.x, axes.up.y, axes.up.z)),
				uMap: u(this.map),
				uMapTexel: u((2 * Math.PI * atm.radius) / settings.mapWidth),
				uAmbient: u(new Vector3(0.2, 0.3, 0.5)),
				uAmbientRefMu: u(0.5),
				uSkyColour: u(new Vector3(0.2, 0.3, 0.5)),
				uCloudCover: u(0.45),
				uSiteLamps: u(0),
				uCloudAngle: u(0),
				uCloudAlt: u(atm.radius + CLOUD_ALTITUDE),
				uCirrusAlt: u(atm.radius + CIRRUS_ALTITUDE),
				uStarBright: u(1),
				uShadowOn: u(0),
				uShadowMap: u(this.dummyShadow),
				uShadowMatrix: u(new Matrix4()),
				uShadowBias: u(-0.0004),
				uShadowTexel: u(1 / 2048),
				uSiteRadius: u(PAD_RADIUS * 40),
				uTerrain: u<unknown>(null),
				uTerrainOn: u(0),
				uBubbleA: u(1),
				uSkipR: u(0),
				uTime: u(0),
				uWaveAnchor: u(WAVES.map(() => 0))
			},
			side: DoubleSide,
			depthTest: true,
			depthWrite: true,
			depthFunc: AlwaysDepth
		});
		this.mesh = new Mesh(geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = -10;
		this.mesh.name = 'planet-pass';

		const bakeMaterial = new ShaderMaterial({
			name: 'terrain-bake',
			vertexShader: terrainBakeVertex,
			fragmentShader: terrainBakeFragment,
			uniforms: {
				uMap: u(this.map),
				uFace: u(0),
				uTexel: u(0.001),
				uRadius: u(atm.radius),
				uSiteDir: u(new Vector3(1, 0, 0))
			},
			depthTest: false,
			depthWrite: false
		});
		const bakeScene = new Scene();
		const bakeMesh = new Mesh(geometry, bakeMaterial);
		bakeMesh.frustumCulled = false;
		bakeScene.add(bakeMesh);
		this.bake = {
			scene: bakeScene,
			camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
			material: bakeMaterial
		};
		this.setSiteDirection(site.latitude, site.longitude);
	}

	private setSiteDirection(latitude: number, longitude: number): void {
		const up = surfaceUp(latitude, longitude);
		(this.bake.material.uniforms.uSiteDir!.value as Vector3).set(up.x, up.y, up.z);
		this.terrainDirty = true;
	}

	/**
	 * Renders the terrain cube map when the site, the map or the resolution changed (first frame,
	 * `setSite`, `setQuality`). Needs a context, so the facade calls it; Bun tests never do.
	 */
	bakeTerrain(gl: WebGLRenderer): void {
		if (!this.terrainDirty || this.terrainSize <= 0) return;
		if (!this.terrainTarget || this.terrainTarget.width !== this.terrainSize) {
			this.terrainTarget?.dispose();
			this.terrainTarget = new WebGLCubeRenderTarget(this.terrainSize, {
				type: HalfFloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: LinearFilter,
				magFilter: LinearFilter,
				depthBuffer: false
			});
			this.material.uniforms.uTerrain!.value = this.terrainTarget.texture;
		}
		const uniforms = this.bake.material.uniforms;
		uniforms.uMap!.value = this.map;
		uniforms.uTexel!.value = (1.2 * Math.PI) / 2 / this.terrainSize;
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		for (let face = 0; face < 6; face++) {
			uniforms.uFace!.value = face;
			gl.setRenderTarget(this.terrainTarget, face);
			gl.render(this.bake.scene, this.bake.camera);
		}
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		this.terrainDirty = false;
		this.material.uniforms.uTerrainOn!.value = 1;
	}

	private buildMap(width: number): DataTexture {
		const m = cachedPlanetMap(width, this.siteLatitude, this.siteLongitude);
		const t = new DataTexture(m.data, m.width, m.height, RGBAFormat, UnsignedByteType);
		t.colorSpace = NoColorSpace;
		t.wrapS = RepeatWrapping;
		t.wrapT = ClampToEdgeWrapping;
		t.magFilter = LinearFilter;
		t.minFilter = LinearMipmapLinearFilter;
		t.generateMipmaps = true;
		t.needsUpdate = true;
		return t;
	}

	private definesFor(s: PresetSettings): Record<string, number> {
		return {
			VIEW_SAMPLES: s.viewSamples,
			LIGHT_SAMPLES: s.lightSamples,
			GROUND_OCTAVES: s.groundOctaves,
			CLOUD_OCTAVES: s.cloudOctaves,
			CLOUDS: 1,
			CLOUD_SHADOWS: s.cloudOctaves >= 4 ? 1 : 0,
			TERRAIN: s.terrainSteps > 0 ? 1 : 0,
			TERRAIN_STEPS: Math.max(1, s.terrainSteps),
			TERRAIN_SHADOW_STEPS: s.terrainShadowSteps
		};
	}

	/** Moves the painted launch site (pad, roads, aprons) to another surface point. */
	setSite(latitude: number, longitude: number): void {
		this.siteLatitude = latitude;
		this.siteLongitude = longitude;
		this.setSiteDirection(latitude, longitude);
		const axes = siteAxes(latitude, longitude);
		const u = this.material.uniforms;
		(u.uSiteEast!.value as Vector3).set(axes.east.x, axes.east.y, axes.east.z);
		(u.uSiteNorth!.value as Vector3).set(axes.north.x, axes.north.y, axes.north.z);
		(u.uSiteUp!.value as Vector3).set(axes.up.x, axes.up.y, axes.up.z);
	}

	/** Phase of each wave at the 1024 m anchor, kept in float64 and reduced to [0, 2 pi) so the GPU never sees large phases. */
	private updateWaveAnchors(cell: Vec3): void {
		const axes = siteAxes(this.siteLatitude, this.siteLongitude);
		const out = this.material.uniforms.uWaveAnchor!.value as number[];
		WAVES.forEach((w, i) => {
			const dx = Math.cos(w.direction);
			const dy = Math.sin(w.direction);
			const d = {
				x: dx * axes.east.x + dy * axes.north.x,
				y: dx * axes.east.y + dy * axes.north.y,
				z: dx * axes.east.z + dy * axes.north.z
			};
			const along = 1024 * (d.x * cell.x + d.y * cell.y + d.z * cell.z);
			const phase = (waveNumber(w.wavelength) * along) % (2 * Math.PI);
			out[i] = phase < 0 ? phase + 2 * Math.PI : phase;
		});
	}

	/** Applies a preset: recompiles for new sample counts, rebuilds the biome map at a new size. */
	setQuality(settings: PresetSettings): void {
		this.material.defines = this.definesFor(settings);
		this.material.needsUpdate = true;
		if (settings.mapWidth !== this.mapWidth) {
			this.map.dispose();
			this.mapWidth = settings.mapWidth;
			this.map = this.buildMap(settings.mapWidth);
			this.material.uniforms.uMap!.value = this.map;
			this.material.uniforms.uMapTexel!.value = (2 * Math.PI * this.radius) / settings.mapWidth;
			this.terrainDirty = true;
		}
		if (settings.terrainSize !== this.terrainSize) {
			this.terrainSize = settings.terrainSize;
			this.terrainDirty = true;
		}
	}

	update(p: PlanetUpdate): void {
		const un = this.material.uniforms as Record<string, U<unknown>>;
		const set = <T>(k: string, fn: (v: T) => void): void => fn(un[k]!.value as T);
		p.camera.updateMatrixWorld();
		set<Matrix4>('uInvProj', (m) => m.copy(p.camera.projectionMatrixInverse));
		set<Matrix3>('uCamRot', (m) => m.setFromMatrix4(p.camera.matrixWorld));
		set<Vector3>('uCamPos', (v) => v.copy(p.camera.position));
		set<Vector3>('uCamUp', (v) => v.set(p.frame.up.x, p.frame.up.y, p.frame.up.z));
		un.uAlt!.value = p.frame.altitude;
		un.uBubbleA!.value = bubbleStrength(p.frame.altitude);
		const toSite = p.frame.camToSite;
		const horizontal = Math.sqrt(
			Math.max(toSite.x ** 2 + toSite.y ** 2 + toSite.z ** 2 - p.frame.altitude ** 2, 0)
		);
		un.uSkipR!.value = flatSkipRadius(p.frame.altitude, horizontal);
		un.uPixelAngle!.value =
			(2 * Math.tan((p.camera.fov * Math.PI) / 360)) / Math.max(1, p.pixelHeight);
		set<Vector3>('uSunDir', (v) => v.set(p.sun.x, p.sun.y, p.sun.z));
		set<Vector3>('uSunBF', (v) => v.set(p.sunBodyFixed.x, p.sunBodyFixed.y, p.sunBodyFixed.z));
		set<Matrix3>('uBodyInv', (m) => m.copy(qMatrix3(p.bodyRotation, true)));
		set<Vector3>('uCamLocal', (v) =>
			v.set(p.frame.camLocal.x, p.frame.camLocal.y, p.frame.camLocal.z)
		);
		set<Vector3>('uAnchorCell', (v) =>
			v.set(p.frame.anchorCell.x, p.frame.anchorCell.y, p.frame.anchorCell.z)
		);
		set<Vector3>('uCamToSite', (v) =>
			v.set(p.frame.camToSite.x, p.frame.camToSite.y, p.frame.camToSite.z)
		);
		set<Vector3>('uAmbient', (v) => v.set(...p.ambient));
		set<Vector3>('uSkyColour', (v) => v.set(...p.skyColour));
		un.uAmbientRefMu!.value = p.ambientRefMu;
		un.uCloudCover!.value = p.cloudCover;
		un.uSiteLamps!.value = p.siteLamps;
		un.uCloudAngle!.value = p.cloudAngle;
		un.uTime!.value = p.time % WAVE_PERIOD;
		this.updateWaveAnchors(p.frame.anchorCell);
		un.uStarBright!.value = p.starBrightness;
		un.uShadowOn!.value = p.shadow.on && p.shadow.map ? 1 : 0;
		un.uShadowMap!.value = p.shadow.map ?? this.dummyShadow;
		set<Matrix4>('uShadowMatrix', (m) => m.copy(p.shadow.matrix));
		un.uShadowBias!.value = p.shadow.bias;
		un.uShadowTexel!.value = p.shadow.texel;
	}

	dispose(): void {
		this.terrainTarget?.dispose();
		this.bake.material.dispose();
		this.dummyShadow.dispose();
		this.map.dispose();
		this.material.dispose();
		this.mesh.geometry.dispose();
	}
}
