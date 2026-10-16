/**
 * The browser-facing facade: a `WebGLRenderer` (logarithmic depth buffer, ADR 0007) driving a
 * `SceneModel`. Needs a canvas, so it is exercised by plan 009's manual check, not by Bun tests.
 */
import type { EntityId, Snapshot } from '@orbital/core';
import { WebGLRenderer } from 'three';
import { SceneModel, type SceneConfig } from './scene.ts';

export interface RendererConfig extends SceneConfig {
	canvas: HTMLCanvasElement;
	/** Defaults to `window.devicePixelRatio` capped at 2. */
	pixelRatio?: number;
}

export interface Renderer {
	/** Apply a new snapshot (call whenever the sim delivers one, not necessarily every frame). */
	update(snapshot: Snapshot): void;
	/** Draw the current scene; call from `requestAnimationFrame`. */
	render(): void;
	resize(width: number, height: number): void;
	setMapView(on: boolean): void;
	toggleMapView(): boolean;
	readonly isMapView: boolean;
	setActiveVessel(id: EntityId | null): void;
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void;
	dispose(): void;
}

export function createRenderer(config: RendererConfig): Renderer {
	const gl = new WebGLRenderer({
		canvas: config.canvas,
		antialias: true,
		logarithmicDepthBuffer: true
	});
	gl.setPixelRatio(config.pixelRatio ?? Math.min(globalThis.devicePixelRatio ?? 1, 2));
	const model = new SceneModel(config);
	return {
		update: (snapshot) => model.sync(snapshot),
		render: () => gl.render(model.scene, model.camera),
		resize(width, height) {
			gl.setSize(width, height, false);
			model.resize(width, height);
		},
		setMapView: (on) => model.setMapView(on),
		toggleMapView: () => model.toggleMapView(),
		get isMapView() {
			return model.isMapView;
		},
		setActiveVessel: (id) => model.setActiveVessel(id),
		orbitCamera: (input) => model.orbitCamera(input),
		dispose() {
			model.dispose();
			gl.dispose();
		}
	};
}
