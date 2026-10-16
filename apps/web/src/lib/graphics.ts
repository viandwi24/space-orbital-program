/**
 * Graphics preset selection and persistence for the flight view (plan 019, ADR 0027). The
 * renderer owns the presets; the host decides which one is active: the player's saved choice,
 * else the device default from a quick capability probe. The settings screen (plan 023) calls
 * `saveGraphicsPreset` and `Flight.setGraphicsPreset`.
 */
import {
	parsePreset,
	selectPreset,
	type DeviceCapabilities,
	type GraphicsPreset
} from '@orbital/renderer';

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
