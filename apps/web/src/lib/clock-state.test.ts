/** Plan 205 / ADR 0201 point 4: the clock state machine. */
import { describe, expect, it } from 'vitest';
import {
	clockPlace,
	clockState,
	PLACE_PAUSE_DEFAULTS,
	placePauses,
	type ClockInput
} from './clock-state';

const base: ClockInput = {
	playerPaused: false,
	placePaused: false,
	place: 'Space Center',
	tabHidden: false,
	keepRunningHidden: false,
	pauseAllowed: true,
	warp: 1
};
const at = (patch: Partial<ClockInput>) => clockState({ ...base, ...patch });

describe('clock state', () => {
	it('runs, or warps', () => {
		expect(at({})).toEqual({ state: 'running', ticks: true, chip: null });
		expect(at({ warp: 100 }).state).toBe('warp');
	});

	it('a player pause beats every other input', () => {
		for (const patch of [
			{ placePaused: true },
			{ tabHidden: true, keepRunningHidden: true },
			{ tabHidden: true },
			{ warp: 1000 }
		]) {
			expect(at({ playerPaused: true, ...patch })).toEqual({
				state: 'paused-player',
				ticks: false,
				chip: 'PAUSED'
			});
		}
	});

	it('a place pause lifts on leaving the place only when the player did not pause', () => {
		expect(at({ placePaused: true, place: 'Hangar' })).toEqual({
			state: 'paused-place',
			ticks: false,
			chip: 'PAUSED · HANGAR'
		});
		expect(at({ placePaused: false, place: 'Space Center' }).ticks).toBe(true);
		expect(at({ placePaused: false, playerPaused: true }).ticks).toBe(false);
	});

	it('Hardcore never reaches a paused state', () => {
		for (const patch of [
			{ playerPaused: true },
			{ placePaused: true },
			{ tabHidden: true },
			{ playerPaused: true, tabHidden: true }
		]) {
			const v = at({ pauseAllowed: false, ...patch });
			expect(v.ticks).toBe(true);
			expect(v.state.startsWith('paused')).toBe(false);
		}
		expect(at({ pauseAllowed: false }).chip).toBe('LOCKED');
	});

	it('a hidden tab with the policy off is paused by tab; with it on, it runs in the background', () => {
		expect(at({ tabHidden: true })).toEqual({ state: 'paused-tab', ticks: false, chip: 'PAUSED' });
		expect(at({ tabHidden: true, keepRunningHidden: true })).toEqual({
			state: 'background',
			ticks: true,
			chip: 'BACKGROUND'
		});
	});

	it('places pause by the defaults unless the player chose otherwise', () => {
		expect(placePauses('Hangar', {})).toBe(true);
		expect(placePauses('Space Center', {})).toBe(false);
		expect(placePauses('Hangar', { Hangar: false })).toBe(false);
		expect(placePauses('Flight', { Flight: true })).toBe(true);
	});
});

describe('the place the clock reads (system audit D4)', () => {
	it('Flight with the map open is Map, so Pause in Map holds there', () => {
		expect(clockPlace('Flight', true)).toBe('Map');
		expect(clockPlace('Flight', false)).toBe('Flight');
		expect(clockPlace('Hangar', true)).toBe('Hangar');
		expect(placePauses(clockPlace('Flight', true), { Map: true })).toBe(true);
	});
	it('every switch in Settings is a place the clock can be in: no Mods', () => {
		expect(Object.keys(PLACE_PAUSE_DEFAULTS)).not.toContain('Mods');
	});
});
