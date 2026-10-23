/**
 * The half of the `Renderer` facade that only talks to the `SceneModel`, shared by the WebGL
 * renderer (`renderer.ts`) and the WebGPU one (`renderer-webgpu.ts`, plan 261): the camera, the map,
 * the site, picking and projection. What draws, sizes and measures stays with each renderer.
 */
import { findPreset } from './camera-presets.ts';
import type { Renderer, RendererDebug } from './renderer.ts';
import type { SceneModel } from './scene.ts';

/** Lowest render scale the governor may ask for; below this the picture is too soft to play. */
export const MIN_RENDER_SCALE = 0.4;

export type SceneFacade = Pick<
	Renderer,
	| 'update'
	| 'setViewInsets'
	| 'setMapView'
	| 'setMapPath'
	| 'setMapFocus'
	| 'mapFocus'
	| 'setMapScope'
	| 'setMapHighlight'
	| 'setMapLayers'
	| 'setRegionOverlay'
	| 'setOverlays'
	| 'bodyDirectionAt'
	| 'bodyIds'
	| 'toggleMapView'
	| 'isMapView'
	| 'setActiveVessel'
	| 'setCameraMode'
	| 'cameraMode'
	| 'resolvedCameraMode'
	| 'focusPart'
	| 'focusedPart'
	| 'highlightPart'
	| 'partAt'
	| 'vesselAt'
	| 'orbitCamera'
	| 'viewDirection'
	| 'project'
	| 'setSiteView'
	| 'setSiteFocus'
	| 'setSiteBuildings'
	| 'setSiteGhost'
	| 'pickSite'
	| 'projectSite'
	| 'setReducedMotion'
	| 'setBrightness'
	| 'resetView'
>;

export type DebugFacade = Pick<
	RendererDebug,
	| 'setSun'
	| 'setCamera'
	| 'applyPreset'
	| 'setPartTemperature'
	| 'focusPart'
	| 'stepEffects'
	| 'setTerrain'
	| 'terrainHeightAt'
	| 'bakeMode'
	| 'silhouetteAA'
	| 'scaledSpace'
	| 'groundDetail'
	| 'setMoonTint'
	| 'setMoonDetail'
	| 'dishAims'
	| 'scene'
>;

export function sceneFacade(model: SceneModel): SceneFacade {
	return {
		update: (snapshot) => model.sync(snapshot),
		setViewInsets: (insets, options) => model.setViewInsets(insets, options),
		setMapView: (on) => model.setMapView(on),
		setMapPath: (segments) => model.setMapPath(segments),
		setMapFocus: (body) => model.setMapFocus(body),
		setMapScope: (scope) => model.setMapScope(scope),
		setMapHighlight: (key) => model.setMapHighlight(key),
		setMapLayers: (layers) => model.setMapLayers(layers),
		setRegionOverlay: (bodies) => model.setRegionOverlay(bodies),
		setOverlays: (layers) => model.setOverlays(layers),
		bodyDirectionAt: (x, y) => model.bodyDirectionAt(x, y),
		get mapFocus() {
			return model.mapFocusBody;
		},
		get bodyIds() {
			return model.bodyIds;
		},
		toggleMapView: () => model.toggleMapView(),
		get isMapView() {
			return model.isMapView;
		},
		setActiveVessel: (id) => model.setActiveVessel(id),
		setCameraMode: (mode) => model.setCameraMode(mode),
		get cameraMode() {
			return model.flightCameraMode;
		},
		get resolvedCameraMode() {
			return model.resolvedCameraMode;
		},
		focusPart: (id) => model.setFocusPart(id),
		get focusedPart() {
			return model.focusedPart;
		},
		highlightPart: (id) => model.highlightPart(id),
		partAt: (x, y) => model.partAt(x, y),
		vesselAt: (x, y) => model.vesselAt(x, y),
		orbitCamera: (input) => model.orbitCamera(input),
		viewDirection: () => model.viewDirection(),
		project: (world) => model.project(world),
		setSiteView: (on, site) => model.setSiteView(on, site),
		setSiteFocus: (p, options) => model.setSiteFocus(p, options),
		setSiteBuildings: (list, roads, site) => model.setSiteBuildings(list, roads, site),
		setSiteGhost: (g) => model.setSiteGhost(g),
		pickSite: (x, y) => model.pickSite(x, y),
		projectSite: (p) => model.projectSite(p),
		setReducedMotion: (on) => model.setReducedMotion(on),
		setBrightness: (level) => model.setBrightness(level),
		resetView: () => model.resetView()
	};
}

export function debugFacade(model: SceneModel): DebugFacade {
	const env = model.environment;
	return {
		setSun: (value) => env.setSunOverride(value),
		setCamera: (rig) => model.setFlightRig(rig),
		applyPreset(name) {
			const p = findPreset(name);
			if (!p) return false;
			env.setSunOverride(p.sun);
			model.setFlightRig(p.rig);
			return true;
		},
		setPartTemperature: (kelvin) => model.setDebugTemperature(kelvin),
		focusPart: (definition, occurrence) => model.setDebugFocus(definition, occurrence),
		dishAims: () => env.site.dishAims.map((a) => ({ ...a })),
		stepEffects(seconds) {
			const steps = Math.max(1, Math.round(seconds * 60));
			for (let i = 0; i < steps; i++) model.prepareFrame(1 / 60, true);
		},
		setMoonTint: (r, g, b) => model.setMoonTint(r, g, b),
		setMoonDetail: (shadows, stones) => model.setMoonDetail(shadows, stones),
		scene: model.scene,
		setTerrain: (terrain) => env.setTerrain(terrain),
		terrainHeightAt: (direction) => env.groundHeight(direction),
		bakeMode: (rebake, gradient) => env.planet.debugBakeMode(rebake, gradient),
		silhouetteAA: (on) => env.planet.debugSilhouetteAA(on),
		scaledSpace: (mode) => env.planet.debugScaledSpace(mode),
		groundDetail: (on) => env.planet.debugGroundDetail(on)
	};
}

/** `own` with the shared half's properties added, getters kept as getters (a spread would read them once). */
export function withShared<T extends object, S extends object>(own: T, shared: S): T & S {
	return Object.defineProperties(own, Object.getOwnPropertyDescriptors(shared)) as T & S;
}
