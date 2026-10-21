/**
 * Which renderer draws the game (plan 261, ADR 0249): today's `WebGLRenderer`, or three's
 * `WebGPURenderer` on its WebGPU backend or, for testing the fallback, on its WebGL2 backend.
 * The player picks it in Settings → Graphics (`RendererChoice`; Automatic, the default, is the newest
 * the browser can run: WebGPU where `navigator.gpu` exists, else WebGL). `?renderer=webgl`,
 * `webgpu` or `webgpu-fallback` on the page's address overrides the choice for that page.
 */
export type RendererBackend = 'webgl' | 'webgpu' | 'webgpu-fallback';

export const RENDERER_BACKENDS: readonly RendererBackend[] = ['webgl', 'webgpu', 'webgpu-fallback'];

/** The player's choice in Settings: a backend, or `auto` for the newest the browser can run. */
export type RendererChoice = 'auto' | 'webgpu' | 'webgl';

export const RENDERER_CHOICES: readonly RendererChoice[] = ['auto', 'webgpu', 'webgl'];

export const parseRendererChoice = (value: unknown): RendererChoice =>
	RENDERER_CHOICES.find((c) => c === value) ?? 'auto';

/** The backend a page's query string asks for (`location.search`), or null when it asks for none. */
export function rendererBackendFrom(search: string): RendererBackend | null {
	const asked = new URLSearchParams(search).get('renderer');
	return RENDERER_BACKENDS.find((b) => b === asked) ?? null;
}

/** The backend to draw with: the address's, else the player's choice, `auto` being WebGPU where the browser has it. */
export function resolveRendererBackend(
	search: string,
	choice: RendererChoice,
	hasWebGPU: boolean
): RendererBackend {
	const asked = rendererBackendFrom(search);
	if (asked) return asked;
	if (choice === 'auto') return hasWebGPU ? 'webgpu' : 'webgl';
	return choice;
}
