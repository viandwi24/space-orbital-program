import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrowserNotice from './ui/BrowserNotice.svelte';
import { detectCapabilities, missingFeatures } from './browser-support';

const all = { webgl2: true, worker: true, webassembly: true };

describe('browser capability check (plan 032, ADR 0040)', () => {
	it('reports nothing when everything is there', () => {
		expect(missingFeatures(all)).toEqual([]);
	});
	it('names each missing feature', () => {
		expect(missingFeatures({ ...all, webgl2: false })).toEqual(['WebGL 2 (3D graphics)']);
		expect(missingFeatures({ ...all, worker: false })).toEqual([
			'Web Workers (background threads)'
		]);
		expect(missingFeatures({ ...all, webassembly: false })).toEqual(['WebAssembly']);
		expect(missingFeatures({ webgl2: false, worker: false, webassembly: false })).toHaveLength(3);
	});
	it('detects WebGL2 from a context and releases it', () => {
		let lost = false;
		const gl = { getExtension: () => ({ loseContext: () => void (lost = true) }) };
		const caps = detectCapabilities({
			createCanvas: () => ({ getContext: (type) => (type === 'webgl2' ? gl : null) }),
			hasWorker: true,
			hasWebAssembly: true
		});
		expect(caps).toEqual(all);
		expect(lost).toBe(true);
	});
	it('treats a null context, no canvas and a throwing probe as no WebGL2', () => {
		const base = { hasWorker: true, hasWebAssembly: true };
		expect(
			detectCapabilities({ ...base, createCanvas: () => ({ getContext: () => null }) }).webgl2
		).toBe(false);
		expect(detectCapabilities({ ...base, createCanvas: () => null }).webgl2).toBe(false);
		expect(
			detectCapabilities({
				...base,
				createCanvas: () => ({
					getContext: () => {
						throw new Error('blocked');
					}
				})
			}).webgl2
		).toBe(false);
	});
	// Compiling a .svelte file needs the Vite plugin: vitest has it, a bare `bun test` does not.
	it.skipIf('Bun' in globalThis)('the notice names what is missing and who is supported', () => {
		const { body } = render(BrowserNotice, { props: { missing: ['WebGL 2 (3D graphics)'] } });
		expect(body).toContain('cannot run Space Orbital Program');
		expect(body).toContain('WebGL 2 (3D graphics)');
		expect(body).toContain('Firefox 114');
		expect(body).toContain('phones are not');
	});
});
