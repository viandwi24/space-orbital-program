/**
 * Plan 403, ADR 0364: a body's bake is data and a texture upload, never a pipeline. The worker and
 * the baker import nothing of three's GPU side, and the manager that lands a map builds only
 * a `DataTexture`. (The compile counter of plan 410 will check it in a browser.)
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const src = (name: string): string =>
	readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const GPU =
	/from 'three(\/[^']*)?'|ShaderMaterial|Material\(|WebGLRenderer|WebGPURenderer|compileAsync|\.compile\(|renderer\.render/;

describe('the bake of another body', () => {
	test.each([
		'body-bake.worker.ts',
		'body-baker.ts',
		'body-bake.ts',
		'body-bakes.ts',
		'body-bake-model.ts',
		'body-bake-cache.ts',
		'hills-look.ts'
	])('%s touches no GPU API', (file) => {
		expect(src(file)).not.toMatch(GPU);
	});

	test('the scene takes a finished map in as a DataTexture and nothing else', () => {
		const scene = src('scene.ts');
		const at = scene.indexOf('private applyBake');
		const body = scene.slice(at, scene.indexOf('private dropBake'));
		expect(body).toContain('new DataTexture(');
		expect(body).not.toMatch(/new \w*Material\(|compile/);
	});
});
