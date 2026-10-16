/**
 * Post chain (ADR 0027): scene -> multisampled half-float target -> bloom -> `OutputPass` (ACES
 * filmic tone mapping with the renderer's exposure, then sRGB). The `low` preset skips it and
 * renders straight to the canvas with the renderer's own tone mapping.
 */
import {
	HalfFloatType,
	Vector2,
	WebGLRenderTarget,
	type Camera,
	type Scene,
	type WebGLRenderer
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { PresetSettings } from './presets.ts';

export class PostChain {
	private composer: EffectComposer | null = null;
	private bloom: UnrealBloomPass | null = null;
	private builtSamples = -1;
	/** Drawing-buffer size in device pixels. */
	private width = 1;
	private height = 1;

	constructor(
		private readonly gl: WebGLRenderer,
		private readonly scene: Scene,
		private readonly camera: Camera,
		private settings: PresetSettings
	) {
		this.apply();
	}

	get active(): boolean {
		return this.settings.post;
	}

	setSettings(settings: PresetSettings): void {
		this.settings = settings;
		this.apply();
	}

	/** `width`/`height` in CSS pixels; the chain renders at device resolution. */
	setSize(width: number, height: number, pixelRatio: number): void {
		this.width = Math.max(1, Math.round(width * pixelRatio));
		this.height = Math.max(1, Math.round(height * pixelRatio));
		if (this.composer) this.resizeChain();
	}

	private resizeChain(): void {
		this.composer?.setPixelRatio(1);
		this.composer?.setSize(this.width, this.height);
		this.bloom?.setSize(
			Math.round(this.width * this.settings.bloomScale),
			Math.round(this.height * this.settings.bloomScale)
		);
	}

	private apply(): void {
		if (!this.settings.post) {
			this.disposeChain();
			return;
		}
		if (this.builtSamples !== this.settings.msaa) this.disposeChain();
		if (!this.composer) this.build();
		this.resizeChain();
	}

	private build(): void {
		this.builtSamples = this.settings.msaa;
		const target = new WebGLRenderTarget(this.width, this.height, {
			type: HalfFloatType,
			samples: this.settings.msaa
		});
		const composer = new EffectComposer(this.gl, target);
		this.bloom = new UnrealBloomPass(
			new Vector2(this.width * this.settings.bloomScale, this.height * this.settings.bloomScale),
			0.32,
			0.55,
			3.0
		);
		composer.addPass(new RenderPass(this.scene, this.camera));
		composer.addPass(this.bloom);
		composer.addPass(new OutputPass());
		this.composer = composer;
	}

	render(dt: number): void {
		this.composer?.render(dt);
	}

	private disposeChain(): void {
		this.bloom?.dispose();
		this.composer?.dispose();
		this.composer = null;
		this.bloom = null;
		this.builtSamples = -1;
	}

	dispose(): void {
		this.disposeChain();
	}
}
