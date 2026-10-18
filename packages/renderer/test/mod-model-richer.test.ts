/** Plan 065 / ADR 0160: a model part folds out with its clip, draws a far model, takes palette slots. */
import { describe, expect, test } from 'bun:test';
import type { PartVisual } from '@orbital/core';
import { LOD, Mesh, MeshStandardMaterial, PerspectiveCamera, Object3D } from 'three';
import { GltfPartProvider, lodAssetKey, usesBasisu } from '../src/parts/gltf-provider.ts';
import type { PartNode, PartShape } from '../src/parts/types.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { buildGlb, lathe } from '../../../tools/mod-build/glb.ts';

const detail = detailOf(PRESETS.high);
const shape: PartShape = { kind: 'cylinder', radius: 0.5, height: 1 };
const attach: Record<string, PartNode> = {
	top: { pos: [0, 0.5, 0], dir: [0, 1, 0] },
	bottom: { pos: [0, -0.5, 0], dir: [0, -1, 0] }
};

/** A body and a leg that swings 90 degrees about X over the 1 s clip "deploy"; `segments` sets detail. */
function legGlb(segments = 12, withClip = true): Uint8Array {
	const q = (a: number) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
	return buildGlb({
		meshes: [
			lathe(
				[
					[0.45, -0.5],
					[0.45, 0.5]
				],
				segments,
				0,
				'body'
			),
			lathe(
				[
					[0.05, -0.4],
					[0.05, 0]
				],
				6,
				0,
				'leg'
			)
		],
		materials: [
			{ name: 'hull', color: [1, 1, 1, 1] },
			{ name: 'trim', color: [0.2, 0.2, 0.2, 1] }
		],
		nodes: [
			{ name: 'body', mesh: 0 },
			{ name: 'leg', mesh: 1, translation: [0.45, 0, 0] }
		],
		roots: [0, 1],
		...(withClip
			? {
					animations: [
						{
							name: 'deploy',
							channels: [
								{
									node: 1,
									path: 'rotation' as const,
									times: new Float32Array([0, 1]),
									values: new Float32Array([...q(0), ...q(Math.PI / 2)])
								}
							]
						}
					]
				}
			: {})
	});
}

const visual: PartVisual = {
	kind: 'tank',
	asset: 'models/leg.glb',
	deploy: { module: 'm.legs', flag: 'deployed', seconds: 2 },
	lods: [{ asset: 'models/leg-far.glb', distance: 60 }],
	palette: { primary: '#ff0000' },
	materials: { hull: 'primary' }
};

async function provider(assets: [string, Uint8Array][], warnings: string[] = []) {
	const p = new GltfPartProvider({
		assets: new Map(assets),
		onWarning: (_d, m) => warnings.push(m)
	});
	await p.preload(assets.map(([k]) => k));
	return p;
}

const request = { definition: 'm.leg', shape, attach, visual, detail };

describe('richer mod models (plan 065)', () => {
	test('the deploy clip follows the flag over `seconds`, like a generated part', async () => {
		const p = await provider([['m.leg', legGlb()]]);
		const model = p.create(request)! as unknown as { deployProgress: number } & ReturnType<
			typeof p.create
		>;
		const leg = model!.root.getObjectByName('leg') as Object3D;
		model!.setState({ modules: { 'm.legs': { deployed: false } } });
		expect(leg.quaternion.x).toBeCloseTo(0, 6);
		model!.setState({ modules: { 'm.legs': { deployed: true } } });
		model!.tick(1); // half of 2 s
		expect(model.deployProgress).toBeCloseTo(0.5, 9);
		expect(leg.quaternion.x).toBeCloseTo(Math.sin(Math.PI / 8), 3);
		model!.tick(1.5);
		expect(model.deployProgress).toBe(1);
		expect(leg.quaternion.x).toBeCloseTo(Math.sin(Math.PI / 4), 5);
		// a part that loads already deployed starts open (no animation from closed)
		const open = p.create(request)! as unknown as { deployProgress: number } & ReturnType<
			typeof p.create
		>;
		open!.setState({ modules: { 'm.legs': { deployed: true } } });
		expect(open.deployProgress).toBe(1);
		p.dispose();
	});

	test('the far model draws beyond its distance', async () => {
		const p = await provider([
			['m.leg', legGlb(24)],
			[lodAssetKey('m.leg', 1), legGlb(6, false)]
		]);
		const model = p.create(request)!;
		const lod = model.root.getObjectByName('lods') as LOD;
		expect(lod.levels.map((l) => l.distance)).toEqual([0, 60]);
		const camera = new PerspectiveCamera();
		const visible = () => lod.levels.findIndex((l) => l.object.visible);
		camera.position.set(0, 0, 10);
		camera.updateMatrixWorld();
		lod.update(camera);
		expect(visible()).toBe(0);
		camera.position.set(0, 0, 100);
		camera.updateMatrixWorld();
		lod.update(camera);
		expect(visible()).toBe(1);
		p.dispose();
	});

	test('a named material takes its palette slot; others keep their colour', async () => {
		const p = await provider([['m.leg', legGlb()]]);
		const model = p.create({ ...request, visual: { ...visual, lods: undefined } })!;
		const colours: Record<string, string> = {};
		model.root.traverse((o) => {
			if (o instanceof Mesh && o.material instanceof MeshStandardMaterial)
				colours[o.material.name] = o.material.color.getHexString();
		});
		expect(colours.hull).toBe('ff0000');
		expect(colours.trim).not.toBe('ff0000');
		p.dispose();
	});

	test('a model without a clip warns; a KTX2 model without a transcoder fails to load with the reason', async () => {
		const warnings: string[] = [];
		const p = await provider([['m.leg', legGlb(12, false)]], warnings);
		p.create(request);
		expect(warnings.join('\n')).toContain('needs an animation');
		const ktx = buildGlb({
			meshes: [
				lathe(
					[
						[0.5, -0.5],
						[0.5, 0.5]
					],
					8,
					0
				)
			],
			materials: [{ color: [1, 1, 1, 1], texture: 0 }],
			nodes: [{ name: 'body', mesh: 0 }],
			roots: [0],
			images: [new Uint8Array(8)],
			imageMime: 'image/ktx2',
			extensionsUsed: ['KHR_texture_basisu']
		});
		expect(usesBasisu(ktx.slice().buffer)).toBe(true);
		const q = await provider([['m.ktx', ktx]]);
		expect(q.failures.get('m.ktx')).toContain('no transcoder');
		p.dispose();
		q.dispose();
	});
});
