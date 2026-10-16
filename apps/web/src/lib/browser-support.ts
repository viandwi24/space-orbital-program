/**
 * What the game needs from the browser (plan 032, ADR 0040, `research/browser-support.md`): WebGL2
 * for the renderer, Workers for the sim and the script sandbox, WebAssembly for the physics engine
 * and QuickJS. The check is a pure function over the facts; `detectCapabilities` collects them.
 */
export interface Capabilities {
	webgl2: boolean;
	worker: boolean;
	webassembly: boolean;
}

/** The names shown to the player, in the order of the notice. */
const NAMES: Record<keyof Capabilities, string> = {
	webgl2: 'WebGL 2 (3D graphics)',
	worker: 'Web Workers (background threads)',
	webassembly: 'WebAssembly'
};

/** Features the browser lacks, as player-facing names; empty when the game can run. */
export function missingFeatures(capabilities: Capabilities): string[] {
	return (Object.keys(NAMES) as (keyof Capabilities)[])
		.filter((key) => !capabilities[key])
		.map((key) => NAMES[key]);
}

/** The environment pieces the probe reads (a double in tests). */
export interface CapabilityEnvironment {
	createCanvas(): { getContext(type: string): unknown } | null;
	hasWorker: boolean;
	hasWebAssembly: boolean;
}

export function detectCapabilities(env: CapabilityEnvironment): Capabilities {
	let webgl2 = false;
	try {
		const context = env.createCanvas()?.getContext('webgl2');
		webgl2 = context !== null && context !== undefined;
		// Do not hold a GPU context for the probe.
		const lose = (context as WebGL2RenderingContext | null)?.getExtension?.('WEBGL_lose_context');
		lose?.loseContext();
	} catch {
		webgl2 = false;
	}
	return { webgl2, worker: env.hasWorker, webassembly: env.hasWebAssembly };
}

/** The probe against the real page. */
export function detectInBrowser(): Capabilities {
	return detectCapabilities({
		createCanvas: () => document.createElement('canvas'),
		hasWorker: typeof Worker === 'function',
		hasWebAssembly: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
	});
}

/** Browsers the game is tested in (`product/browser-support.md`). */
export const SUPPORTED_BROWSERS =
	'a current desktop Chrome, Edge, Firefox or Safari (Chrome and Edge 97, Firefox 114, Safari 16 or newer)';
