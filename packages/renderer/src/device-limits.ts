/**
 * The device limits the renderer asks for (plan 410): WebGPU's default is 16 sampled textures per shader
 * stage, and a planet shadow pipeline with a mod planet's images and the looks' maps in it needs 17 or
 * more. Asking for more than the default only where the adapter has it keeps `requestDevice` from failing.
 */

/** The most sampled textures per stage the renderer asks for. */
export const TEXTURE_LIMIT_WANTED = 32;
/** WebGPU's default. */
export const TEXTURE_LIMIT_DEFAULT = 16;

/** The `requiredLimits` for an adapter that offers `adapterMax` sampled textures per stage, or null for the default. */
export function limitsFor(
	adapterMax: number | undefined
): { maxSampledTexturesPerShaderStage: number } | null {
	if (!adapterMax || !Number.isFinite(adapterMax) || adapterMax <= TEXTURE_LIMIT_DEFAULT)
		return null;
	return {
		maxSampledTexturesPerShaderStage: Math.min(Math.floor(adapterMax), TEXTURE_LIMIT_WANTED)
	};
}

/** The limits to request from this browser's adapter; null where there is no adapter or it has no more. */
export async function wantedLimits(): Promise<ReturnType<typeof limitsFor>> {
	try {
		const gpu = (globalThis.navigator as { gpu?: GPU } | undefined)?.gpu;
		const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
		return limitsFor(adapter?.limits.maxSampledTexturesPerShaderStage);
	} catch {
		return null;
	}
}
