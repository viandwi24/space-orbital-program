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
import { msaaSamples, type PresetSettings } from './presets.ts';
import { STOCK_BLOOM, type PostLook } from './post-profile.ts';

export class PostChain {
	private composer: EffectComposer | null = null;
	private bloom: UnrealBloomPass | null = null;
	private builtSamples = -1;
	/** A mod's bloom (plan 405); the stock one without. */
	private bloomLook: PostLook['bloom'] = { ...STOCK_BLOOM };
	/** The preset's pixel ratio before the render scale: from 2 up the target takes 2 samples (plan 252). */
	private baseRatio = 1;
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

	/** Size in pixels of the target the scene is drawn into while the chain is active. */
	get targetSize(): { width: number; height: number } {
		return { width: this.width, height: this.height };
	}

	/** A mod's bloom (plan 405, ADR 0345): from the next frame, and in a chain built later. */
	setBloom(bloom: PostLook['bloom']): void {
		this.bloomLook = { ...bloom };
		if (this.bloom) {
			this.bloom.strength = bloom.strength;
			this.bloom.radius = bloom.radius;
			this.bloom.threshold = bloom.threshold;
		}
	}

	setSettings(settings: PresetSettings): void {
		this.settings = settings;
		this.apply();
	}

	/** MSAA samples of the target now: the preset's, at most 2 from pixel ratio 2 up. */
	get samples(): number {
		return msaaSamples(this.settings.msaa, this.baseRatio);
	}

	/**
	 * `width`/`height` in CSS pixels; the chain renders at device resolution. `baseRatio` is the pixel
	 * ratio before the governor's render scale (default `pixelRatio`): the samples follow it, so a render
	 * scale step does not rebuild the chain.
	 */
	setSize(width: number, height: number, pixelRatio: number, baseRatio = pixelRatio): void {
		this.width = Math.max(1, Math.round(width * pixelRatio));
		this.height = Math.max(1, Math.round(height * pixelRatio));
		this.baseRatio = baseRatio;
		if (this.composer && this.settings.post && this.builtSamples !== this.samples) {
			this.disposeChain();
			this.build();
		}
		if (this.composer) this.resizeChain();
	}

	private resizeChain(): void {
		// A chain the preset does not use stays built but shrinks to a pixel: its programs stay compiled,
		// so the switch back does not compile the bloom and output passes in the middle of a frame (ADR 0055).
		const active = this.settings.post;
		const width = active ? this.width : 1;
		const height = active ? this.height : 1;
		this.composer?.setPixelRatio(1);
		this.composer?.setSize(width, height);
		this.bloom?.setSize(
			Math.max(1, Math.round(width * this.settings.bloomScale)),
			Math.max(1, Math.round(height * this.settings.bloomScale))
		);
	}

	private apply(): void {
		if (!this.settings.post && !this.composer) return;
		if (this.settings.post && this.builtSamples !== this.samples) this.disposeChain();
		if (!this.composer) this.build();
		this.resizeChain();
	}

	private build(): void {
		this.builtSamples = this.samples;
		const target = new WebGLRenderTarget(this.width, this.height, {
			type: HalfFloatType,
			samples: this.samples
		});
		const composer = new EffectComposer(this.gl, target);
		this.bloom = new UnrealBloomPass(
			new Vector2(this.width * this.settings.bloomScale, this.height * this.settings.bloomScale),
			this.bloomLook.strength,
			this.bloomLook.radius,
			this.bloomLook.threshold
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
