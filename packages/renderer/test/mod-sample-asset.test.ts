/**
 * Plan 051 / ADR 0076: the sample mod's asset part, built and loaded the way the game does it:
 * the build tool writes the package, the page parses and resolves it, hands the checked bytes to
 * the glTF provider, and the model is made by the same factory the flight scene and the VAB use.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	importModBundle,
	installModSdk,
	parseModPackage,
	resolveMods,
	type PartVisual
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import * as sdk from '@orbital/sdk';
import { PartModelFactory } from '../src/parts/factory.ts';
import { GltfPartProvider } from '../src/parts/gltf-provider.ts';
import type { PartNode, PartShape } from '../src/parts/types.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';

const folder = join(import.meta.dir, '../../../examples/mod-sample');
const PART = 'sample.spike-engine';

// Bun has no createImageBitmap; the sample model embeds a PNG, so the browser's decoder is faked.
const g = globalThis as { createImageBitmap?: unknown };
const realBitmap = g.createImageBitmap;

let resolved: Awaited<ReturnType<typeof resolveMods>>;
let part: {
	shape: PartShape;
	visual: PartVisual;
	attach: Record<string, PartNode>;
};

beforeAll(async () => {
	g.createImageBitmap = async () => ({ width: 64, height: 64, close() {} });
	installModSdk(sdk);
	const built = await buildMod(folder);
	const parsed = await parseModPackage(built.text);
	if (!parsed.ok) throw new Error(parsed.errors.join('; '));
	resolved = await resolveMods(
		[
			{
				manifest: parsed.package.manifest,
				code: parsed.package.code,
				assets: parsed.package.assets
			}
		],
		{ builtin: [Stock], importModule: importModBundle }
	);
	const { loadPlugins } = await import('@orbital/core');
	const def = loadPlugins([Stock, ...resolved.plugins]).registries.parts.get(PART)!;
	if (def.shape?.kind !== 'cylinder') throw new Error('expected a cylinder shape');
	part = {
		shape: { kind: 'cylinder', radius: def.shape.radius, height: def.shape.height },
		visual: def.visual!,
		attach: def.attach as Record<string, PartNode>
	};
});

describe('the sample mod asset part', () => {
	test('the package resolves and lists the part with its asset', () => {
		expect(resolved.rejected).toEqual([]);
		expect(resolved.partAssets).toEqual([
			{ part: PART, mod: 'sample', path: 'models/spike-engine.glb' }
		]);
	});

	test('model fits its physics shape and attach nodes with no warning, and has a plume and a pivot', async () => {
		const warnings: string[] = [];
		const asset = resolved.assets.get('sample')!.get('models/spike-engine.glb')!;
		const provider = new GltfPartProvider({
			assets: new Map([[PART, asset.bytes]]),
			onWarning: (_d, m) => warnings.push(m)
		});
		const factory = new PartModelFactory({
			shapes: new Map([[PART, part.shape]]),
			visuals: new Map([[PART, part.visual]]),
			attach: new Map([[PART, part.attach]]),
			providers: [provider],
			detail: detailOf(PRESETS.high)
		});
		await factory.preload([PART]);
		expect(provider.failures.size).toBe(0);
		const model = factory.create(PART);
		expect(warnings).toEqual([]);
		expect(model.triangles).toBe(asset.info!.triangles);
		expect(model.bounds.max.y).toBeCloseTo(0.5, 2);
		expect(model.bounds.min.y).toBeCloseTo(-0.5, 2);
		expect(model.bounds.max.x).toBeLessThanOrEqual(0.625 + 0.0625);
		const moving = model.root.getObjectByName('moving')!;
		expect(moving.getObjectByName('plume')).toBeDefined();
		let textured = false;
		model.root.traverse((o) => {
			const material = (o as { material?: { map?: unknown } }).material;
			if (material?.map) textured = true;
		});
		expect(textured).toBe(true);
		model.dispose();
		factory.dispose();
		provider.dispose();
		g.createImageBitmap = realBitmap;
	});
});
