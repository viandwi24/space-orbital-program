/**
 * Graphics preset selection and persistence for the flight view (plan 019, ADR 0027). The
 * renderer owns the presets; the host decides which one is active: the player's saved choice,
 * else the device default from a quick capability probe. The settings screen (plan 023) calls
 * `saveGraphicsPreset` and `Flight.setGraphicsPreset`.
 */
// The preset table has no Three.js in it: the main menu reads the saved choice through this subpath
// without loading the renderer (plan 023, bundle budget).
import {
	parsePreset,
	selectPreset,
	type DeviceCapabilities,
	type GraphicsPreset
} from '@orbital/renderer/presets';

import {
	parseRendererChoice,
	resolveRendererBackend,
	type RendererBackend,
	type RendererChoice
} from '@orbital/renderer/backend';

const KEY = 'orbital.graphics';

export function loadGraphicsPreset(): GraphicsPreset | null {
	try {
		return parsePreset(localStorage.getItem(KEY));
	} catch {
		return null;
	}
}

export function saveGraphicsPreset(preset: GraphicsPreset): void {
	try {
		localStorage.setItem(KEY, preset);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/** Forget the saved choice: the device default applies again (the settings dialog's "Automatic"). */
export function clearGraphicsPreset(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// private mode: the choice applies for this session only
	}
}

/** The player's choice for the settings dialog: a preset, or `auto` for the device default. */
export type PresetChoice = GraphicsPreset | 'auto';

export const presetChoice = (): PresetChoice => loadGraphicsPreset() ?? 'auto';

/**
 * The quality governor (plan 039, ADR 0053) lowers resolution and then the preset when the view runs
 * under about 55 fps. On unless the player turned it off; only the string `off` is a no.
 */
const AUTO_KEY = 'orbital.graphics.auto';

export const parseAutoQuality = (value: unknown): boolean => value !== 'off';

export function loadAutoQuality(): boolean {
	try {
		return parseAutoQuality(localStorage.getItem(AUTO_KEY));
	} catch {
		return true;
	}
}

export function saveAutoQuality(on: boolean): void {
	try {
		localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/** Reads GPU facts from a throwaway WebGL2 context; returns conservative values when WebGL is missing. */
export function probeCapabilities(): DeviceCapabilities {
	const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
	const base: DeviceCapabilities = {
		maxTextureSize: 4096,
		...(nav?.deviceMemory !== undefined ? { deviceMemoryGb: nav.deviceMemory } : {}),
		...(nav?.hardwareConcurrency !== undefined
			? { hardwareConcurrency: nav.hardwareConcurrency }
			: {}),
		mobile: Boolean(
			nav?.maxTouchPoints &&
			nav.maxTouchPoints > 1 &&
			/Mobi|Android|iPhone|iPad/i.test(nav.userAgent)
		)
	};
	try {
		const gl = document.createElement('canvas').getContext('webgl2');
		if (!gl) return base;
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : undefined;
		const out: DeviceCapabilities = {
			...base,
			maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
			...(gpu ? { gpu } : {})
		};
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return out;
	} catch {
		return base;
	}
}

/** The saved preset if valid, else the device default. Pure given its inputs (tested). */
export function resolvePreset(
	saved: GraphicsPreset | null,
	caps: DeviceCapabilities
): GraphicsPreset {
	return saved ?? selectPreset(caps);
}

/** The preset the flight view should start with. */
export const initialGraphicsPreset = (): GraphicsPreset =>
	resolvePreset(loadGraphicsPreset(), probeCapabilities());

/**
 * The renderer (plan 261, ADR 0249): Automatic (the default) draws with the newest the browser can
 * run, WebGPU where it has it; WebGL is the older one. Read when a view creates its renderer, so a
 * change applies when the page is next opened. `?renderer=` on the address still overrides it.
 */
const RENDERER_KEY = 'orbital.graphics.renderer';

export function loadRendererChoice(): RendererChoice {
	try {
		return parseRendererChoice(localStorage.getItem(RENDERER_KEY));
	} catch {
		return 'auto';
	}
}

export function saveRendererChoice(choice: RendererChoice): void {
	try {
		if (choice === 'auto') localStorage.removeItem(RENDERER_KEY);
		else localStorage.setItem(RENDERER_KEY, choice);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/**
 * Whether the browser has a WebGPU adapter, asked once. `navigator.gpu` alone is not enough: a
 * browser without a usable GPU (headless, a blocked driver) has the object and no adapter, and
 * three's WebGPU renderer then runs on its WebGL2 fallback, slower than the WebGL renderer.
 */
let webgpuProbe: Promise<boolean> | null = null;
export function hasWebGPUAdapter(): Promise<boolean> {
	const gpu = (
		globalThis.navigator as
			(Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }) | undefined
	)?.gpu;
	webgpuProbe ??= gpu
		? gpu
				.requestAdapter()
				.then((a) => a !== null && a !== undefined)
				.catch(() => false)
		: Promise.resolve(false);
	return webgpuProbe;
}

/** The backend a view draws with: the address's, else the player's choice (Automatic: WebGPU where an adapter exists). */
export async function rendererBackend(): Promise<RendererBackend> {
	return resolveRendererBackend(
		globalThis.location?.search ?? '',
		loadRendererChoice(),
		await hasWebGPUAdapter()
	);
}
