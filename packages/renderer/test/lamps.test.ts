/** Vessel lights (plan 242, ADR 0239): the light budget, the culling and the lens. */
import { describe, expect, it } from 'bun:test';
import { PerspectiveCamera, Scene, SpotLight } from 'three';
import {
	BLINK_PERIOD,
	LampEffect,
	blinkOn,
	colourNumber,
	createLensGeometry
} from '../src/effects/lamp.ts';
import {
	LAMP_BUDGET,
	LAMP_CULL_DISTANCE,
	LampPool,
	chooseLamps,
	type LampLight
} from '../src/lamps.ts';

const lamp = (x: number, over: Partial<LampLight> = {}): LampLight => ({
	position: [x, 0, 0],
	direction: [0, 1, 0],
	colour: 0xffffff,
	intensity: 1,
	angle: 0.4,
	range: 100,
	...over
});

describe('choosing the lamps that throw light', () => {
	it('keeps the nearest few, nearest first', () => {
		const many = Array.from({ length: 20 }, (_, i) => lamp(i * 5));
		const chosen = chooseLamps(many, [0, 0, 0]);
		expect(chosen).toHaveLength(LAMP_BUDGET);
		expect(chosen.map((l) => l.position[0])).toEqual([0, 5, 10, 15]);
		expect(chooseLamps(many, [97, 0, 0], 2).map((l) => l.position[0])).toEqual([95, 90]);
	});
	it('drops lamps that are off, too far for the eye or out of their own reach', () => {
		expect(chooseLamps([lamp(1, { intensity: 0 })], [0, 0, 0])).toEqual([]);
		expect(chooseLamps([lamp(LAMP_CULL_DISTANCE + 1, { range: 1000 })], [0, 0, 0])).toEqual([]);
		expect(chooseLamps([lamp(400, { range: 50 })], [0, 0, 0])).toEqual([]);
		expect(chooseLamps([lamp(100, { range: 50 })], [0, 0, 0])).toHaveLength(1);
	});
});

describe('the pool', () => {
	it('never lights more than its budget, however many lamps are lit, and puts the rest out', () => {
		const scene = new Scene();
		const pool = new LampPool(scene);
		const camera = new PerspectiveCamera();
		const lights = () => scene.children.filter((c): c is SpotLight => c instanceof SpotLight);
		expect(lights()).toHaveLength(LAMP_BUDGET);
		const lit = () => lights().filter((l) => l.visible && l.intensity > 0).length;
		const many = Array.from({ length: 50 }, (_, i) => lamp(i));
		expect(pool.update(many, camera)).toBe(LAMP_BUDGET);
		expect(lit()).toBe(LAMP_BUDGET);
		expect(pool.update([lamp(3, { colour: 0xff0000 })], camera)).toBe(1);
		expect(lit()).toBe(1);
		expect(
			lights()
				.find((l) => l.visible)!
				.color.getHex()
		).toBe(0xff0000);
		expect(pool.update([], camera)).toBe(0);
		expect(lit()).toBe(0);
		pool.dispose();
		expect(lights()).toHaveLength(0);
	});
});

describe('the lens', () => {
	const effect = () =>
		new LampEffect(
			{ module: 'stock.light', pos: [0.1, 0, 0], dir: [1, 0, 0], angle: 18, range: 120 },
			createLensGeometry()
		);
	it('reads nothing while off and the module snapshot while on', () => {
		const e = effect();
		e.update({ on: false }, 0);
		expect(e.read()).toBeNull();
		e.update({ on: true, colour: '#ff4a3a', brightness: 0.5, blink: false }, 0);
		const r = e.read()!;
		expect(r.colour).toBe(0xff4a3a);
		expect(r.intensity).toBe(0.5);
		expect(r.range).toBe(120);
		expect(r.angle).toBeCloseTo((18 * Math.PI) / 180, 9);
		e.update(undefined, 0);
		expect(e.read()).toBeNull();
	});
	it('a blinking lamp is lit for half of each period', () => {
		const e = effect();
		const m = { on: true, colour: '#ffffff', brightness: 1, blink: true };
		e.update(m, 0.1);
		expect(e.read()).not.toBeNull();
		e.update(m, BLINK_PERIOD * 0.75);
		expect(e.read()).toBeNull();
		expect(blinkOn(BLINK_PERIOD + 0.1)).toBe(true);
	});
	it('points its object along the part-frame direction', () => {
		const e = effect();
		const up = e.object.localToWorld(e.object.position.clone().set(0, 1, 0));
		expect(up.x - 0.1).toBeCloseTo(1, 9);
		expect(colourNumber('nonsense')).toBe(0xffffff);
	});
});
