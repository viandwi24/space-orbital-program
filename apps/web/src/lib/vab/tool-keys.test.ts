/** The Move and Rotate tools' keys (plan 279, ADR 0258 point 3). */
import { describe, expect, it } from 'vitest';
import { createKeymap, keyIdOf, KEY_PROFILES } from '../keybindings';
import { MOVE_FINE, MOVE_STEP, ROTATE_FINE, ROTATE_STEP, snapTo, toolKeyEffect } from './tool-keys';

describe('tool keys', () => {
	it('in both profiles 1, 2, 3 pick the tools, H toggles node snapping and W/S A/D Q/E F R drive the tools', () => {
		for (const profile of KEY_PROFILES) {
			const map = createKeymap({}, profile);
			expect(map.actionFor('vab', 'Digit1')).toBe('toolPlace');
			expect(map.actionFor('vab', 'Digit2')).toBe('toolMove');
			expect(map.actionFor('vab', 'Digit3')).toBe('toolRotate');
			expect(map.actionFor('vab', 'KeyH')).toBe('snapNodes');
			const ids = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyR'].map((k) =>
				map.actionFor('tool', k)
			);
			expect(ids).toEqual([
				'toolUp',
				'toolDown',
				'toolLeft',
				'toolRight',
				'toolFore',
				'toolAft',
				'toolFrame',
				'toolReset'
			]);
			// Shift is not a chord: Shift+W is still W (the fine step)
			expect(map.actionFor('tool', keyIdOf({ key: 'W', code: 'KeyW' }))).toBe('toolUp');
		}
	});

	it('Move nudges 0.1 m along X, Y and Z, 0.01 m with Shift', () => {
		expect(toolKeyEffect('toolUp', 'move', false)).toEqual({
			kind: 'nudge',
			delta: [0, MOVE_STEP, 0]
		});
		expect(toolKeyEffect('toolLeft', 'move', true)).toEqual({
			kind: 'nudge',
			delta: [-MOVE_FINE, 0, 0]
		});
		expect(toolKeyEffect('toolAft', 'move', false)).toEqual({
			kind: 'nudge',
			delta: [0, 0, -MOVE_STEP]
		});
		expect(MOVE_STEP).toBe(0.1);
		expect(MOVE_FINE).toBe(0.01);
	});

	it('Rotate turns 15 degrees (5 with Shift): W/S pitch, A/D roll, Q/E yaw', () => {
		expect(toolKeyEffect('toolUp', 'rotate', false)).toEqual({
			kind: 'turn',
			axis: 'x',
			angle: ROTATE_STEP
		});
		expect(toolKeyEffect('toolRight', 'rotate', false)).toEqual({
			kind: 'turn',
			axis: 'z',
			angle: -ROTATE_STEP
		});
		expect(toolKeyEffect('toolFore', 'rotate', true)).toEqual({
			kind: 'turn',
			axis: 'y',
			angle: ROTATE_FINE
		});
		expect(ROTATE_STEP).toBeCloseTo((15 * Math.PI) / 180, 12);
	});

	it('F switches the axes and R resets in either tool; other keys do nothing', () => {
		for (const tool of ['move', 'rotate'] as const) {
			expect(toolKeyEffect('toolFrame', tool, false)).toEqual({ kind: 'frame' });
			expect(toolKeyEffect('toolReset', tool, true)).toEqual({ kind: 'reset' });
			expect(toolKeyEffect('frame', tool, false)).toBeNull();
		}
	});

	it('a drag snaps to the step unless Alt is held', () => {
		expect(snapTo(0.234, 0.1, false)).toBeCloseTo(0.2, 12);
		expect(snapTo(0.234, 0.1, true)).toBe(0.234);
	});
});
