import { describe, expect, it } from 'vitest';
import {
	MIN_VIEWPORT,
	STICK_DEADZONE,
	isSmallScreen,
	pinchZoomFactor,
	rollAxis,
	stickAxes,
	throttleFromSlider,
	touchControlsOn
} from './touch-model';

describe('steering pad', () => {
	it('sends nothing inside the dead zone', () => {
		expect(stickAxes(0, 0, 60)).toEqual({ pitch: 0, yaw: 0 });
		expect(stickAxes(60 * STICK_DEADZONE * 0.9, 0, 60)).toEqual({ pitch: 0, yaw: 0 });
	});
	it('up is pitch +, right is yaw +, like W and D', () => {
		const up = stickAxes(0, -60, 60);
		expect(up.pitch).toBeCloseTo(1, 9);
		expect(up.yaw).toBeCloseTo(0, 9);
		const right = stickAxes(60, 0, 60);
		expect(right.yaw).toBeCloseTo(1, 9);
		expect(stickAxes(0, 60, 60).pitch).toBeCloseTo(-1, 9);
		expect(stickAxes(-60, 0, 60).yaw).toBeCloseTo(-1, 9);
	});
	it('is analog between the dead zone and the rim and clamps beyond it', () => {
		const half = stickAxes(0, -30, 60).pitch;
		expect(half).toBeGreaterThan(0.3);
		expect(half).toBeLessThan(0.7);
		expect(stickAxes(0, -600, 60).pitch).toBe(1);
		const diagonal = stickAxes(100, -100, 60);
		expect(Math.hypot(diagonal.pitch, diagonal.yaw)).toBeCloseTo(1, 9);
	});
	it('grows monotonically with the offset', () => {
		let prev = 0;
		for (let d = 10; d <= 70; d += 5) {
			const v = stickAxes(d, 0, 60).yaw;
			expect(v).toBeGreaterThanOrEqual(prev);
			prev = v;
		}
	});
	it('survives zero radius, NaN and infinity', () => {
		expect(stickAxes(5, 5, 0)).toEqual({ pitch: 0, yaw: 0 });
		expect(stickAxes(Number.NaN, 4, 60)).toEqual({ pitch: 0, yaw: 0 });
		for (const v of [Infinity, -Infinity])
			expect(Math.abs(stickAxes(v, 0, 60).yaw)).toBeLessThanOrEqual(1);
	});
});

describe('roll, throttle, pinch', () => {
	it('roll buttons cancel when both are held', () => {
		expect(rollAxis(false, false)).toBe(0);
		expect(rollAxis(true, false)).toBe(-1);
		expect(rollAxis(false, true)).toBe(1);
		expect(rollAxis(true, true)).toBe(0);
	});
	it('the slider maps the track top to full and the bottom to zero, clamped', () => {
		expect(throttleFromSlider(100, 100, 200)).toBe(1);
		expect(throttleFromSlider(300, 100, 200)).toBe(0);
		expect(throttleFromSlider(200, 100, 200)).toBeCloseTo(0.5, 9);
		expect(throttleFromSlider(-50, 100, 200)).toBe(1);
		expect(throttleFromSlider(900, 100, 200)).toBe(0);
		expect(throttleFromSlider(5, 100, 0)).toBe(0);
	});
	it('fingers apart zoom in (factor under 1), together zoom out, bounded', () => {
		expect(pinchZoomFactor(100, 200)).toBeCloseTo(0.5, 9);
		expect(pinchZoomFactor(200, 100)).toBe(2);
		expect(pinchZoomFactor(100, 100)).toBe(1);
		expect(pinchZoomFactor(10, 1000)).toBe(0.5);
		expect(pinchZoomFactor(0, 100)).toBe(1);
		expect(pinchZoomFactor(100, Number.NaN)).toBe(1);
	});
});

describe('when the controls show and the small-screen notice', () => {
	it('auto follows the primary pointer, on and off are absolute', () => {
		expect(touchControlsOn('auto', true)).toBe(true);
		expect(touchControlsOn('auto', false)).toBe(false);
		expect(touchControlsOn('on', false)).toBe(true);
		expect(touchControlsOn('off', true)).toBe(false);
	});
	it('a tablet in landscape is fine; phones in either orientation get the notice', () => {
		expect(isSmallScreen({ width: 1024, height: 768 })).toBe(false);
		expect(isSmallScreen({ width: 1366, height: 1024 })).toBe(false);
		expect(isSmallScreen({ width: 1024, height: 700 })).toBe(false);
		expect(isSmallScreen({ width: 390, height: 844 })).toBe(true);
		expect(isSmallScreen({ width: 844, height: 390 })).toBe(true);
		expect(isSmallScreen({ width: 768, height: 1024 })).toBe(true);
		expect(isSmallScreen({ width: MIN_VIEWPORT.width, height: MIN_VIEWPORT.height })).toBe(false);
		expect(isSmallScreen({ width: MIN_VIEWPORT.width - 1, height: 900 })).toBe(true);
	});
});
