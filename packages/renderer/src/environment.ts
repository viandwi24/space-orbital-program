/**
 * The flight environment of one body: planet pass, sun light with a shadow that follows the
 * vessel, sky ambient, fog, exposure and the launch site (ADR 0027). Contains no
 * `WebGLRenderer`, so it runs in Bun; the facade adds PMREM and the post chain.
 */
import type { BodyDefinition, Quat, Vec3 } from '@orbital/core';
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
import { adaptExposure, exposureFor } from './exposure.ts';
import { planetFrame } from './planet-frame.ts';
import { PlanetPass } from './planet.ts';
import { PRESETS, type GraphicsPreset } from './presets.ts';
import { fitShadow } from './shadow-fit.ts';
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
}

const SHADOW_BIAS = -0.00006;

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
		shadowActive: false
	};

	private preset: GraphicsPreset;
	private sunOverride: { elevation: number; azimuth: number } | null = null;
	private cloudAngle = 0;
	private time = 0;
	private cloudCover = 0.42;
	private exposure = 1;
	private config: EnvironmentConfig;

	constructor(config: EnvironmentConfig) {
		this.config = config;
		this.preset = config.preset;
		const body = config.body;
		this.radius = body.radius;
		this.atmosphere = atmosphereFor(
			body.radius,
			body.atmosphere?.height ?? 1,
			body.atmosphere?.scaleHeight
		);
		const settings = PRESETS[config.preset];
		this.planet = new PlanetPass(this.atmosphere, settings, config.site);
		this.site = new LaunchSite(body.radius, config.site, settings.trees, settings.tufts);
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
		this.planet.setSite(latitude, longitude);
		this.site.setSite(latitude, longitude);
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
		if (shadows) this.sunLight.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
		// A new size needs a new map; the renderer reallocates when it sees the size differ.
		this.sunLight.shadow.map?.setSize(s.shadowMapSize, s.shadowMapSize);
	}

	/** Sun direction in the inertial/render frame for the current body rotation. */
	sunDirection(bodyRotation: Quat): Vec3 {
		if (!this.sunOverride) return starDirection();
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
		const sun = this.sunDirection(bodyRotation);
		const sunBF = rotateInverse(bodyRotation, sun);
		const elev = sunElevation(sun, frame.up);
		const elevDeg = elev / DEG;

		// Light colours from the same atmosphere model as the shader.
		const alt = frame.altitude;
		const sunT = sunTransmittance(this.atmosphere, alt, elev);
		const ambient = skyAmbient(this.atmosphere, alt, elev);
		const horizon = horizonColour(this.atmosphere, alt, elev);
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
		this.sunLight.color.setRGB(sunT[0], sunT[1], sunT[2], LinearSRGBColorSpace);
		this.sunLight.intensity = this.atmosphere.sunIrradiance;
		this.hemisphere.color.setRGB(skyIrr[0], skyIrr[1], skyIrr[2], LinearSRGBColorSpace);
		this.hemisphere.groundColor.setRGB(bounce[0], bounce[1], bounce[2], LinearSRGBColorSpace);
		this.hemisphere.intensity = 1;
		this.hemisphere.position.set(frame.up.x, frame.up.y, frame.up.z);
		const atmFade = Math.max(0, 1 - alt / this.atmosphere.height);
		this.fog.color.setRGB(horizon[0], horizon[1], horizon[2], LinearSRGBColorSpace);
		this.fog.density = 0.00003 * atmFade;

		// Floodlights come on around dusk (sun below 3 degrees at the camera), full at -6.
		const siteLamps = 1 - smoothstep(-6, 3, elevDeg);

		// Exposure adapts toward the day/night target.
		const target = exposureFor(elevDeg);
		this.exposure = adaptExposure(this.exposure, target, input.dt);

		// Shadow camera around the casters.
		const mapSize = PRESETS[this.preset].shadowMapSize;
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
			const sinSun = Math.max(dot(sun, frame.up), 0.06);
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
			starBrightness: 1,
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
			Math.round(Math.log2(Math.max(alt, 1)) * 2),
			this.preset
		].join('|');
		this.state.sun = sun;
		this.state.sunElevationDeg = elevDeg;
		this.state.altitude = alt;
		this.state.exposure = this.exposure;
		this.state.envKey = key;
		this.state.shadowActive = shadowActive;
	}

	dispose(): void {
		this.planet.dispose();
		this.site.dispose();
	}
}
