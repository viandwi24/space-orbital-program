/** Plan 347, ADR 0296: the renderer's overlay meshes from mod shapes. */
import { describe, expect, test } from 'bun:test';
import { Group, PerspectiveCamera, Scene, Sprite } from 'three';
import { OverlayLayer } from '../src/overlay-layer.ts';

describe('overlay layer', () => {
	test('body-fixed shapes hang under the body, inertial ones at the body; views and pixel size', () => {
		const scene = new Scene();
		const holder = new Group();
		scene.add(holder);
		const layer = new OverlayLayer(scene, (id) => (id === 'home' ? holder : undefined));
		layer.set([
			{
				id: 'm.path',
				shapes: [
					{ kind: 'polyline', body: 'home', frame: 'body-fixed', color: '#00ff00', points: [{ x: 600_000, y: 0, z: 0 }, { x: 600_000, y: 1_000, z: 0 }], dash: { on: 100, off: 100 } },
					{ kind: 'marker', body: 'home', frame: 'inertial', color: '#ff000080', position: { x: 0, y: 600_000, z: 0 }, style: 'cross', size: 32, views: ['map'] },
					{ kind: 'label', body: 'moon', frame: 'body-fixed', color: '#ffffff', position: { x: 1, y: 0, z: 0 }, text: 'gone' }
				]
			}
		]);
		expect(layer.count).toBe(2); // the moon is not drawn: nothing to hang its label on
		expect(holder.children).toHaveLength(1);
		layer.place(new Map([['home', { x: 0, y: 0, z: 0 }]]), { x: 0, y: 0, z: 0 }, false);
		const marker = scene.children.find((c) => c.name === 'mod-overlays')!.children[0] as Sprite;
		expect(marker.visible).toBe(false); // map only
		layer.place(new Map([['home', { x: 0, y: 0, z: 0 }]]), { x: 0, y: 0, z: 0 }, true);
		expect(marker.visible).toBe(true);
		expect(marker.position.y).toBe(600_000);
		const camera = new PerspectiveCamera(60);
		camera.position.set(0, 600_000, 1_000);
		layer.frame(camera, 1_000);
		// 32 px of 1 000 at 1 km with a 60° field: 2·tan(30°)·1 000·32/1 000 m
		expect(marker.scale.y).toBeCloseTo(2 * Math.tan(Math.PI / 6) * 32, 3);
		// the same shapes again build nothing new; [] clears
		const before = holder.children[0];
		layer.set([{ id: 'm.path', shapes: [] }]);
		expect(layer.count).toBe(0);
		expect(before?.parent).toBeNull();
	});
});
