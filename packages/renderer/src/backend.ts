/**
 * Which renderer draws the game (plan 261, ADR 0246): today's `WebGLRenderer`, or three's
 * `WebGPURenderer` on its WebGPU backend or, for testing the fallback, on its WebGL2 backend.
 * Picked by `?renderer=webgpu` or `?renderer=webgpu-fallback` on the page's address; anything else
 * is WebGL. The WebGPU renderer lives on the plan's branch until the owner's manual test.
 */
export type RendererBackend = 'webgl' | 'webgpu' | 'webgpu-fallback';

export const RENDERER_BACKENDS: readonly RendererBackend[] = ['webgl', 'webgpu', 'webgpu-fallback'];

/** The backend a page's query string asks for (`location.search`). */
export function rendererBackendFrom(search: string): RendererBackend {
	const asked = new URLSearchParams(search).get('renderer');
	return RENDERER_BACKENDS.find((b) => b === asked) ?? 'webgl';
}
