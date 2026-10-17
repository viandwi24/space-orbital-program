import { describe, expect, test } from 'bun:test';
import {
	ARM_CLEAR_HEIGHT,
	ARM_EXTEND_RATE,
	ARM_RETRACTED,
	ARM_RETRACT_RATE,
	BEACON_DIM,
	BEACON_DUTY,
	BEACON_PERIOD,
	STEAM_DEFAULT,
	STEAM_LIFE,
	STEAM_PUFFS,
	PAD_FAR,
	PAD_JUMP,
	WINDOW_LIT_SHARE,
	armStep,
	armTarget,
	beaconLevel,
	newPadTracker,
	padHeight,
	steamPuff,
	steamVisibility,
	windowGlow,
	windowIsLit
} from '../src/site-animation.ts';

describe('site animation (plan 038)', () => {
	test('the arms are extended on the pad, folded from ARM_CLEAR_HEIGHT up and monotone between', () => {
		expect(armTarget(0)).toBe(0);
		expect(armTarget(null)).toBe(0);
		expect(armTarget(0.02)).toBe(0); // settling on the legs does not move them
		expect(armTarget(ARM_CLEAR_HEIGHT)).toBeCloseTo(ARM_RETRACTED, 12);
		expect(armTarget(500)).toBeCloseTo(ARM_RETRACTED, 12);
		let last = 0;
		for (let h = 0; h <= 3; h += 0.01) {
			const a = armTarget(h);
			expect(a).toBeGreaterThanOrEqual(last - 1e-12);
			last = a;
		}
	});

	test('the slew never exceeds its rate, retracts faster than it extends and converges', () => {
		expect(ARM_RETRACT_RATE).toBeGreaterThan(ARM_EXTEND_RATE);
		for (const dt of [0.001, 0.016, 0.1, 1]) {
			expect(armStep(0, ARM_RETRACTED, dt)).toBeLessThanOrEqual(ARM_RETRACT_RATE * dt + 1e-12);
			expect(ARM_RETRACTED - armStep(ARM_RETRACTED, 0, dt)).toBeLessThanOrEqual(
				ARM_EXTEND_RATE * dt + 1e-12
			);
		}
		let a = 0;
		for (let i = 0; i < 600; i++) a = armStep(a, ARM_RETRACTED, 1 / 60);
		expect(a).toBeCloseTo(ARM_RETRACTED, 12);
		// never overshoots, a zero or negative step does nothing
		expect(armStep(0.5, 0.5, 1)).toBe(0.5);
		expect(armStep(0.2, 1, 0)).toBe(0.2);
		expect(armStep(0.2, 1, -1)).toBe(0.2);
	});

	test('a vessel lifting at 0.5 g leaves the arms folded before it has gone 3 m (they are clear in time)', () => {
		// arms start at the target of the first centimetres; the vessel's height follows 0.5 g
		let angle = 0;
		let t = 0;
		const dt = 1 / 120;
		for (; t < 3; t += dt) {
			const h = 0.5 * 4.9 * t * t;
			angle = armStep(angle, armTarget(h), dt);
			if (h >= 3) break;
		}
		expect(angle).toBeGreaterThan(ARM_RETRACTED * 0.97);
	});

	test('steam puffs are deterministic, rise, fade to nothing at the end of life and repeat', () => {
		for (let i = 0; i < STEAM_PUFFS; i++) {
			for (const t of [0, 1.7, 40.3]) {
				const a = steamPuff(i, t);
				expect(steamPuff(i, t)).toEqual(a);
				expect(a.alpha).toBeGreaterThanOrEqual(0);
				expect(a.alpha).toBeLessThanOrEqual(STEAM_DEFAULT.strength);
				expect(a.y).toBeGreaterThanOrEqual(0);
			}
			// repeats with its lifetime except for the jitter that changes each lifetime
			const a = steamPuff(i, 3.3);
			const b = steamPuff(i, 3.3 + STEAM_LIFE);
			expect(b.y).toBeCloseTo(a.y, 9);
			expect(b.size).toBeCloseTo(a.size, 9);
			expect(b.alpha).toBeCloseTo(a.alpha, 9);
		}
		// just before the end of life the puff is invisible and high; just after it is new and low
		const end = steamPuff(0, STEAM_LIFE - 1e-4);
		expect(end.alpha).toBeLessThan(1e-6);
		const fresh = steamPuff(0, STEAM_LIFE + 1e-4);
		expect(fresh.y).toBeLessThan(end.y);
		// rises with time inside one life
		let last = -1;
		for (let t = 0; t < STEAM_LIFE - 0.01; t += 0.1) {
			const p = steamPuff(0, t);
			expect(p.y).toBeGreaterThanOrEqual(last);
			last = p.y;
		}
		// the vent dies down with the vessel's height
		expect(steamPuff(2, 5, 0).alpha).toBe(0);
		expect(steamVisibility(0)).toBe(1);
		expect(steamVisibility(10)).toBe(0);
		expect(steamVisibility(null)).toBe(1);
	});

	test('a beacon is lit for its duty share of the period and dim otherwise', () => {
		let lit = 0;
		const n = 3000;
		for (let i = 0; i < n; i++) {
			const level = beaconLevel((i / n) * BEACON_PERIOD * 7, 0.37);
			expect([1, BEACON_DIM]).toContain(level);
			if (level === 1) lit++;
		}
		expect(lit / n).toBeCloseTo(BEACON_DUTY, 2);
		// two phases are not lit at the same time
		const a = beaconLevel(0.05, 0);
		const b = beaconLevel(0.05, 0.5);
		expect(a).toBe(1);
		expect(b).toBe(BEACON_DIM);
	});

	test('windows: a fixed 40 to 70 percent lit by pane, glow only at night', () => {
		let lit = 0;
		for (let k = 0; k < 4000; k++) {
			expect(windowIsLit(k)).toBe(windowIsLit(k));
			if (windowIsLit(k)) lit++;
		}
		expect(lit / 4000).toBeGreaterThan(0.4);
		expect(lit / 4000).toBeLessThan(0.7);
		expect(Math.abs(lit / 4000 - WINDOW_LIT_SHARE)).toBeLessThan(0.05);
		expect(windowGlow(0)).toBe(0);
		expect(windowGlow(0.1)).toBe(0);
		expect(windowGlow(1)).toBe(1);
		expect(windowGlow(0.4)).toBeGreaterThan(0);
	});
});

describe('pad tracking (plan 038)', () => {
	test('the first reading near the pad is the rest; lift-off reads as height; far away reads as far', () => {
		const t = newPadTracker();
		expect(padHeight(t, 14.2, 0.3)).toBe(0); // tall vessel: its origin is 14 m up while it stands
		expect(padHeight(t, 14.18, 0.3)).toBe(0); // settling on its legs
		expect(padHeight(t, 14.18, 0.3)).toBe(0);
		expect(padHeight(t, 15.2, 0.3)).toBeCloseTo(1.02, 9);
		expect(padHeight(t, 30, 2)).toBeCloseTo(15.82, 9);
		expect(padHeight(t, 500, 400)).toBe(PAD_FAR); // far from the pad axis
		expect(padHeight(t, null, 0)).toBeNull();
		// a new vessel on the pad starts again at 0, even if its origin is higher
		expect(padHeight(t, 40, 0.5)).toBe(0);
	});

	test('a reading that jumps is a different vessel, not a lift-off', () => {
		const t = newPadTracker();
		padHeight(t, 3, 0);
		padHeight(t, 3.5, 0);
		expect(padHeight(t, 3.5 + PAD_JUMP * 2, 0)).toBe(0);
	});
});
