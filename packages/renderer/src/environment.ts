/**
 * The flight environment of one body: planet pass, sun light with a shadow that follows the
 * vessel, sky ambient, fog, exposure and the launch site (ADR 0027). Contains no
 * `WebGLRenderer`, so it runs in Bun; the facade adds PMREM and the post chain.
 */
import {
	LEGACY_ZONE,
	createTerrainField,
	type BodyDefinition,
	type Quat,
	type TerrainField,
	type Vec3
} from '@orbital/core';
import { LEGACY_TERRAIN, type WorldTerrainSpec } from './terrain-zones.ts';
import {
	DirectionalLight,
	FogExp2,
	HemisphereLight,
	LinearSRGBColorSpace,
	Matrix4,
	Object3D,
	PerspectiveCamera,
	type DepthTexture
} from 'three';
import {
	atmosphereFor,
	horizonColour,
	skyAmbient,
	sunTransmittance,
	type Atmosphere,
	type RGB
} from './atmosphere-model.ts';
import { AIRLESS_EXPOSURE, airlessLight, type AirlessLight } from './airless-light.ts';
import { adaptExposure, exposureFor, starVisibility } from './exposure.ts';
import { planetFrame } from './planet-frame.ts';
import { PlanetPass } from './planet.ts';
import { PRESETS, type GraphicsPreset } from './presets.ts';
import { fitShadow } from './shadow-fit.ts';
import { liftAboveTerrain } from './terrain-patch.ts';
import { LaunchSite } from './site-meshes.ts';
import { DEG, dot, length, rotate, rotateInverse, sub, vec } from './vec.ts';

const smoothstep = (a: number, b: number, x: number): number => {
	const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return t * t * (3 - 2 * t);
};
import { siteAxes, starDirection, sunElevation, sunFromHorizontal } from './sun.ts';

export interface LaunchSiteConfig {
	/** Defaults to the first body; latitude/longitude default to 0 like the sim's surface placement. */
	latitude: number;
	longitude: number;
}

export interface EnvironmentConfig {
	body: Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'>;
	preset: GraphicsPreset;
	site: LaunchSiteConfig;
	/** The world's home terrain (plan 084, ADR 0142); default the Legacy seed and one zone at `site`. */
	terrain?: WorldTerrainSpec;
	/** Site mode (ADR 0117): buildings from a list instead of the hard-coded layout. */
	siteBuildings?: boolean;
}

export interface EnvironmentFrameInput {
	camera: PerspectiveCamera;
	pixelHeight: number;
	/** Floating-origin render space. */
	bodyRender: Vec3;
	bodyRotation: Quat;
	/** Active vessel in render space, if any, and the radius of its bounding sphere. */
	vesselRender: Vec3 | null;
	vesselRadius: number;
	mapView: boolean;
	/** Wall-clock seconds since the last call (clouds, exposure adaptation). */
	dt: number;
	/**
	 * Local vertical (inertial, unit) to take the sun's elevation, the exposure and the shadow from,
	 * instead of the radial of this body: a camera on a moon (ADR 0054).
	 */
	up?: Vec3;
	/** The camera is in the sphere of an airless body: its light is the sun, regolith bounce and a sky floor (ADR 0058). */
	airless?: boolean;
	/**
	 * The camera is at a later body with air (plan 071, ADR 0121 point 2): light, fog and exposure
	 * come from its atmosphere at this altitude, not the home planet's.
	 */
	air?: { atmosphere: Atmosphere; altitude: number };
}

export interface EnvironmentState {
	sun: Vec3;
	/** Sun elevation at the camera, degrees. */
	sunElevationDeg: number;
	altitude: number;
	exposure: number;
	/** Sun colour/ambient changed enough since the last environment-map capture to warrant a new one. */
	envKey: string;
	shadowActive: boolean;
	/** Local vertical the light is taken from (inertial, unit). */
	up: Vec3;
	/** Light of an airless body when the camera is at one (ADR 0058); null at the home planet. */
	airless: AirlessLight | null;
}

const SHADOW_BIAS = -0.00006;
/** Frames a preset switch waits before it reallocates the shadow map (ADR 0055). */
const SHADOW_SETTLE_FRAMES = 3;
/** The camera is held at least this far above the terrain under it (no hills in the near plane), m. */
export const CAMERA_CLEARANCE = 0.5;

export class Environment {
	readonly atmosphere: Atmosphere;
	readonly planet: PlanetPass;
	readonly site: LaunchSite;
	readonly sunLight: DirectionalLight;
	readonly hemisphere: HemisphereLight;
	readonly fog: FogExp2;
	readonly root = new Object3D();
	readonly radius: number;
	readonly state: EnvironmentState = {
		sun: starDirection(),
		sunElevationDeg: 30,
		altitude: 0,
		exposure: 1,
		envKey: '',
		shadowActive: false,
		up: vec(0, 1, 0),
		airless: null
	};

	private preset: GraphicsPreset;
	/** Side of the sun shadow map as allocated (0 = none), and frames until it follows the preset (ADR 0055). */
	private shadowSize = 0;
	private shadowDelay = 0;
	private sunOverride: { elevation: number; azimuth: number } | null = null;
	/** Toward the system's star from the home body (plan 122, ADR 0119); null: the fixed direction. */
	private star: Vec3 | null = null;
	private cloudAngle = 0;
	private time = 0;
	private cloudCover = 0.42;
	private exposure = 1;
	private config: EnvironmentConfig;
	/** The same heights the sim's ground uses (ADR 0043): the camera is held above them. */
	private terrain: TerrainField;
	private worldTerrain: WorldTerrainSpec;

	constructor(config: EnvironmentConfig) {
		this.config = config;
		this.worldTerrain = config.terrain ?? {
			seed: LEGACY_TERRAIN.seed,
			zones: [{ ...LEGACY_ZONE, latitude: config.site.latitude, longitude: config.site.longitude }]
		};
		this.terrain = createTerrainField({ radius: config.body.radius, ...this.worldTerrain });
		this.preset = config.preset;
		const body = config.body;
		this.radius = body.radius;
		this.atmosphere = atmosphereFor(
			body.radius,
			body.atmosphere?.height ?? 1,
			body.atmosphere?.scaleHeight,
			body.atmosphere?.surfacePressure
		);
		const settings = PRESETS[config.preset];
		this.planet = new PlanetPass(
			this.atmosphere,
			settings,
			config.site,
			body.atmosphere?.aurora !== false,
			this.worldTerrain
		);
		this.site = new LaunchSite(
			body.radius,
			config.site,
			settings.trees,
			settings.tufts,
			config.siteBuildings === true
		);
		this.sunLight = new DirectionalLight(0xffffff, this.atmosphere.sunIrradiance);
		this.sunLight.name = 'sun';
		this.sunLight.shadow.bias = SHADOW_BIAS;
		this.sunLight.shadow.normalBias = 0.08;
		this.sunLight.shadow.radius = 1.5;
		this.hemisphere = new HemisphereLight(0x8899cc, 0x334422, 1);
		this.hemisphere.name = 'sky';
		this.fog = new FogExp2(0xaabbdd, 0.00003);
		this.root.add(
			this.planet.mesh,
			this.planet.edgeMesh,
			this.site.root,
			this.sunLight,
			this.sunLight.target,
			this.hemisphere
		);
		this.applyPreset();
	}

	get currentPreset(): GraphicsPreset {
		return this.preset;
	}

	setPreset(preset: GraphicsPreset): void {
		this.preset = preset;
		this.applyPreset();
	}

	/** The vessel really launched from here (see `SceneModel.sync`); moves the site meshes and the painted pad. */
	setSite(latitude: number, longitude: number): void {
		this.config = { ...this.config, site: { latitude, longitude } };
		const [primary, ...rest] = this.worldTerrain.zones;
		this.worldTerrain = {
			...this.worldTerrain,
			zones: [{ ...primary!, latitude, longitude }, ...rest]
		};
		this.terrain = createTerrainField({ radius: this.radius, ...this.worldTerrain });
		this.planet.setSite(latitude, longitude);
		this.site.setSite(latitude, longitude);
	}

	/** The world's terrain (seed and site zones) for the CPU field the camera reads and the GPU bakes. */
	setTerrain(terrain: WorldTerrainSpec): void {
		this.worldTerrain = terrain;
		this.terrain = createTerrainField({ radius: this.radius, ...terrain });
		this.planet.setTerrain(terrain);
	}

	/** Dev/screenshot override of the sun (elevation, azimuth clockwise from north at the launch site); null restores the real sun. */
	setSunOverride(value: { elevation: number; azimuth: number } | null): void {
		this.sunOverride = value;
	}

	private applyPreset(): void {
		const s = PRESETS[this.preset];
		this.planet.setQuality(s);
		this.site.setTrees(s.trees, s.tufts);
		const shadows = s.shadowMapSize > 0;
		this.sunLight.castShadow = shadows;
		if (shadows && this.shadowSize === 0) {
			// no map is allocated yet: the first render allocates it at this size
			this.shadowSize = s.shadowMapSize;
			this.sunLight.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
		} else {
			// A new size reallocates the map, 20 to 30 ms for 4096: not in the frame that switches everything else.
			this.shadowDelay = SHADOW_SETTLE_FRAMES;
		}
	}

	/** Moves the shadow map to the preset's size once the frames after a switch have passed. */
	private settleShadowMap(): void {
		if (this.shadowDelay === 0 || --this.shadowDelay > 0) return;
		const size = PRESETS[this.preset].shadowMapSize;
		this.shadowSize = size;
		const shadow = this.sunLight.shadow;
		if (size > 0) {
			shadow.mapSize.set(size, size);
			shadow.map?.setSize(size, size);
		} else {
			shadow.map?.dispose();
			shadow.map = null;
		}
	}

	/** Moves the camera up along its radial when it is inside the terrain (or closer than `CAMERA_CLEARANCE`). */
	private holdAboveGround(camera: PerspectiveCamera, bodyRender: Vec3, bodyRotation: Quat): void {
		const rel = sub(vec(camera.position.x, camera.position.y, camera.position.z), bodyRender);
		const bodyFixed = rotateInverse(bodyRotation, rel);
		const lifted = liftAboveTerrain(bodyFixed, this.terrain, this.radius, CAMERA_CLEARANCE);
		if (lifted === bodyFixed) return;
		const world = rotate(bodyRotation, lifted);
		camera.position.set(bodyRender.x + world.x, bodyRender.y + world.y, bodyRender.z + world.z);
		camera.updateMatrixWorld();
	}

	/** Height of the ground (the same field the sim uses, ADR 0043) along a unit body-fixed direction, m. */
	groundHeight(direction: Vec3): number {
		return this.terrain.heightAt(direction);
	}

	/** The direction to the system's star, from the snapshot each sync; null keeps the fixed one. */
	setStarDirection(direction: Vec3 | null): void {
		this.star = direction;
	}

	/** Sun direction in the inertial/render frame for the current body rotation. */
	sunDirection(bodyRotation: Quat): Vec3 {
		if (!this.sunOverride) return this.star ?? starDirection();
		const axes = siteAxes(this.config.site.latitude, this.config.site.longitude);
		const frame = {
			up: rotate(bodyRotation, axes.up),
			east: rotate(bodyRotation, axes.east),
			north: rotate(bodyRotation, axes.north)
		};
		return sunFromHorizontal(frame, this.sunOverride.elevation, this.sunOverride.azimuth);
	}

	update(input: EnvironmentFrameInput): void {
		const { camera, bodyRender, bodyRotation } = input;
		this.holdAboveGround(camera, bodyRender, bodyRotation);
		const cameraRender = vec(camera.position.x, camera.position.y, camera.position.z);
		const frame = planetFrame({
			bodyRender,
			cameraRender,
			bodyRotation,
			radius: this.radius,
			siteLatitude: this.config.site.latitude,
			siteLongitude: this.config.site.longitude
		});
		this.site.place(bodyRender, bodyRotation);
		this.site.setDetail(Math.hypot(frame.camToSite.x, frame.camToSite.y, frame.camToSite.z));
		this.site.animate({ dt: input.dt, time: this.time, vesselRender: input.vesselRender });
		const sun = this.sunDirection(bodyRotation);
		const sunBF = rotateInverse(bodyRotation, sun);
		const up = input.up ?? frame.up;
		const elev = sunElevation(sun, up);
		const elevDeg = elev / DEG;

		// Light colours from the same atmosphere model as the shader: the home planet's, or the air of
		// the later body the camera is at (ADR 0121 point 2).
		const atm = input.air?.atmosphere ?? this.atmosphere;
		const alt = input.air?.altitude ?? frame.altitude;
		const sunT = sunTransmittance(atm, alt, elev);
		const ambient = skyAmbient(atm, alt, elev);
		const horizon = horizonColour(atm, alt, elev);
		const night: RGB = [0.0035, 0.0048, 0.0095];
		const skyIrr: RGB = [
			(ambient[0] + night[0]) * Math.PI,
			(ambient[1] + night[1]) * Math.PI,
			(ambient[2] + night[2]) * Math.PI
		];
		const sinEl = Math.max(Math.sin(elev), 0);
		const bounce: RGB = [
			0.16 * (this.atmosphere.sunIrradiance * sunT[0] * sinEl + skyIrr[0]),
			0.2 * (this.atmosphere.sunIrradiance * sunT[1] * sinEl + skyIrr[1]),
			0.1 * (this.atmosphere.sunIrradiance * sunT[2] * sinEl + skyIrr[2])
		];
		// On an airless body the sun is white, fades at its horizon and nothing scatters it (ADR 0058).
		const air = input.airless ? airlessLight(elevDeg, this.atmosphere.sunIrradiance) : null;
		if (air) {
			sunT[0] = sunT[1] = sunT[2] = air.sun;
			skyIrr[0] = air.sky[0] * Math.PI;
			skyIrr[1] = air.sky[1] * Math.PI;
			skyIrr[2] = air.sky[2] * Math.PI;
			bounce[0] = air.ground[0] * Math.PI;
			bounce[1] = air.ground[1] * Math.PI;
			bounce[2] = air.ground[2] * Math.PI;
		}
		this.sunLight.color.setRGB(sunT[0], sunT[1], sunT[2], LinearSRGBColorSpace);
		this.sunLight.intensity = this.atmosphere.sunIrradiance;
		this.hemisphere.color.setRGB(skyIrr[0], skyIrr[1], skyIrr[2], LinearSRGBColorSpace);
		this.hemisphere.groundColor.setRGB(bounce[0], bounce[1], bounce[2], LinearSRGBColorSpace);
		this.hemisphere.intensity = 1;
		this.hemisphere.position.set(up.x, up.y, up.z);
		const atmFade = Math.max(0, 1 - alt / atm.height);
		this.fog.color.setRGB(horizon[0], horizon[1], horizon[2], LinearSRGBColorSpace);
		this.fog.density = 0.00003 * atmFade;

		// Floodlights come on around dusk (sun below 3 degrees at the camera), full at -6.
		const siteLamps = 1 - smoothstep(-6, 3, elevDeg);

		// Exposure adapts toward the day/night target.
		const target = exposureFor(elevDeg) * (air ? AIRLESS_EXPOSURE : 1);
		this.exposure = adaptExposure(this.exposure, target, input.dt);

		// Shadow camera around the casters.
		this.settleShadowMap();
		const mapSize = PRESETS[this.preset].shadowMapSize > 0 ? this.shadowSize : 0;
		const sunUp = sunT[0] + sunT[1] + sunT[2] > 0.01;
		let shadowActive = false;
		let shadowMap: DepthTexture | null = null;
		if (mapSize > 0 && sunUp && input.vesselRender && !input.mapView) {
			const siteDistance = length(
				sub(
					vec(this.site.root.position.x, this.site.root.position.y, this.site.root.position.z),
					input.vesselRender
				)
			);
			const nearSite = siteDistance < 300;
			const radius = nearSite ? 110 : Math.max(12, input.vesselRadius * 1.6);
			const reach = nearSite ? 45 : input.vesselRadius;
			const sinSun = Math.max(dot(sun, up), 0.06);
			const receiverReach = Math.min(2_500, (nearSite ? 45 : input.vesselRadius * 2) / sinSun + 60);
			const centre = nearSite
				? vec(this.site.root.position.x, this.site.root.position.y, this.site.root.position.z)
				: input.vesselRender;
			const fit = fitShadow(sun, centre, radius, mapSize, reach, receiverReach);
			this.sunLight.position.set(fit.position.x, fit.position.y, fit.position.z);
			this.sunLight.target.position.set(fit.target.x, fit.target.y, fit.target.z);
			const cam = this.sunLight.shadow.camera;
			cam.left = -fit.halfExtent;
			cam.right = fit.halfExtent;
			cam.top = fit.halfExtent;
			cam.bottom = -fit.halfExtent;
			cam.near = fit.near;
			cam.far = fit.far;
			cam.updateProjectionMatrix();
			this.sunLight.castShadow = true;
			shadowActive = true;
			shadowMap = (this.sunLight.shadow.map?.depthTexture as DepthTexture | null) ?? null;
		} else {
			this.sunLight.castShadow = false;
			this.sunLight.position.set(
				cameraRender.x + sun.x * 100,
				cameraRender.y + sun.y * 100,
				cameraRender.z + sun.z * 100
			);
			this.sunLight.target.position.set(cameraRender.x, cameraRender.y, cameraRender.z);
		}
		this.sunLight.updateMatrixWorld();
		this.sunLight.target.updateMatrixWorld();

		this.cloudAngle += input.dt * 2.2e-5;
		this.time += input.dt;
		this.site.setLamps(siteLamps);
		const shadowMatrix = new Matrix4().copy(this.sunLight.shadow.matrix);
		this.planet.update({
			camera,
			pixelHeight: input.pixelHeight,
			frame,
			bodyRotation,
			sun,
			sunBodyFixed: sunBF,
			ambient: skyIrr,
			skyColour: ambient,
			ambientRefMu: dot(sun, frame.up),
			siteLamps,
			cloudCover: this.cloudCover,
			cloudAngle: this.cloudAngle,
			time: this.time,
			starBrightness: starVisibility(elevDeg, alt, this.atmosphere.height),
			shadow: {
				on: shadowActive,
				map: shadowMap,
				matrix: shadowMatrix,
				bias: SHADOW_BIAS,
				texel: 1 / Math.max(1, mapSize)
			}
		});

		const key = [
			Math.round(elevDeg / 2),
			air ? 'airless' : Math.round(Math.log2(Math.max(alt, 1)) * 2),
			this.preset
		].join('|');
		this.state.sun = sun;
		this.state.sunElevationDeg = elevDeg;
		this.state.altitude = alt;
		this.state.exposure = this.exposure;
		this.state.envKey = key;
		this.state.shadowActive = shadowActive;
		this.state.up = up;
		this.state.airless = air;
	}

	dispose(): void {
		this.planet.dispose();
		this.site.dispose();
	}
}
