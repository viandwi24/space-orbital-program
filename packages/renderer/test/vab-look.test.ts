import { describe, expect, it } from 'bun:test';
import { Color, DirectionalLight, FogExp2, Group, HemisphereLight, Scene, SpotLight } from 'three';
import {
	ZEN_LIGHTS,
	applyLook,
	createStudio,
	lightLook,
	type LookTargets
} from '../src/vab/studio.ts';

/** Every light in a scene with its kind, and every visible light. */
const lights = (scene: Scene) => {
	const all: string[] = [];
	scene.traverse((o) => {
		if ((o as { isLight?: boolean }).isLight) all.push(`${o.type}:${o.visible}`);
	});
	return all;
};

describe('the Hangar looks (plan 375)', () => {
	const scene = new Scene();
	scene.background = new Color(0x0b1118);
	scene.fog = new FogExp2(0x172029, 0.006);
	const hangar = new Group();
	const props = new Group();
	const key = new DirectionalLight(0xfff1de, 2);
	const fill = new HemisphereLight(0xb7cdea, 0x2a2118, 0.15);
	const spot = new SpotLight(0xfff4e6, 900);
	const studioFill = new DirectionalLight(0xffffff, 0);
	const studio = createStudio(0.3);
	scene.add(hangar, props, key, fill, spot, studioFill, studio.root);
	const targets: LookTargets = {
		hangar: [hangar, props],
		studio: studio.root,
		lights: [
			lightLook(key, ZEN_LIGHTS.key),
			lightLook(fill, ZEN_LIGHTS.sky),
			lightLook(spot, ZEN_LIGHTS.off),
			lightLook(studioFill, ZEN_LIGHTS.fill)
		],
		fog: scene.fog as FogExp2,
		fogDensity: { normal: 0.006, zen: 0 },
		background: scene.background as Color,
		backgroundColour: { normal: 0x0b1118, zen: 0x3b4048 }
	};

	it('a switch changes no light count or visibility, only intensity and colour', () => {
		const before = lights(scene);
		applyLook(targets, 'zen');
		expect(lights(scene)).toEqual(before);
		expect(spot.intensity).toBe(0);
		expect(studioFill.intensity).toBeGreaterThan(0);
		expect(key.color.getHex()).toBe(0xffffff);
		applyLook(targets, 'normal');
		expect(lights(scene)).toEqual(before);
		expect(spot.intensity).toBe(900);
		expect(studioFill.intensity).toBe(0);
		expect(key.color.getHex()).toBe(0xfff1de);
	});

	it('zen hides the hangar and shows the studio; fog stays, only thinner', () => {
		applyLook(targets, 'zen');
		expect(hangar.visible).toBe(false);
		expect(props.visible).toBe(false);
		expect(studio.root.visible).toBe(true);
		expect(scene.fog).toBeInstanceOf(FogExp2);
		expect((scene.fog as FogExp2).density).toBe(0);
		expect((scene.background as Color).getHex()).toBe(0x3b4048);
		applyLook(targets, 'normal');
		expect(hangar.visible).toBe(true);
		expect(studio.root.visible).toBe(false);
		expect((scene.fog as FogExp2).density).toBe(0.006);
	});

	it('the studio has a backdrop, a shadow-taking floor and two grids at the floor', () => {
		const kinds = studio.root.children.map((c) => c.type);
		expect(kinds).toEqual(['Mesh', 'Mesh', 'GridHelper', 'GridHelper']);
		const floor = studio.root.children[1]!;
		expect(floor.receiveShadow).toBe(true);
		expect(floor.position.y).toBeCloseTo(0.298, 3);
	});
});
