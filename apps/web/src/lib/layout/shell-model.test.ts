/** Plan 233 (ADR 0222 point 1): the Base layout's numbers, segments, time and zones. */
import { describe, expect, it } from 'vitest';
import {
	BASE,
	FIXED_GROUP,
	STATUS_ZONES,
	activeFixed,
	elapsedText,
	warpSegments,
	warpText
} from './shell-model';

describe('Base layout (BASE_LAYOUT.md)', () => {
	it('sizes: bars 44, margins 24, status 32, safe area 80/24/56, bell 26', () => {
		expect(BASE).toMatchObject({ margin: 24, bar: 44, status: 32 });
		expect(BASE.safe).toEqual({ top: 80, side: 24, bottom: 56 });
		expect(BASE.safe.bottom).toBe(BASE.status + BASE.margin);
		expect(BASE.bell).toEqual({ size: 26, icon: 14, badge: 8 });
	});

	it('eight warp segments: four of 6 px, four of 10, the level in accent, dim while paused', () => {
		const steps = [1, 2, 4, 10, 50, 100, 1000, 10_000];
		const s = warpSegments(steps, 4, false);
		expect(s.map((x) => x.width)).toEqual([6, 6, 6, 6, 10, 10, 10, 10]);
		expect(s.map((x) => x.state)).toEqual([
			'past',
			'past',
			'past',
			'past',
			'now',
			'off',
			'off',
			'off'
		]);
		expect(warpSegments(steps, 4, true).every((x) => x.state === 'off')).toBe(true);
		expect(warpSegments(steps, 0, false, 10).map((x) => x.locked)).toEqual([
			false,
			false,
			false,
			false,
			true,
			true,
			true,
			true
		]);
		expect(warpText(1000)).toBe('1k×');
		expect(warpText(50)).toBe('50×');
		expect(warpText(4, true)).toBe('—');
	});

	it('T+ time drops leading zero units', () => {
		const day = 21_600;
		const year = 426 * day;
		expect(elapsedText(62, day, year)).toBe('T+ 01:02');
		expect(elapsedText(3 * 3600 + 120, day, year)).toBe('T+ 03:02');
		expect(elapsedText(2 * year + 70 * day + 3600 + 32 * 60, day, year)).toBe('T+ 2y 70d 01:32');
		expect(elapsedText(5 * day, day, year)).toBe('T+ 5d 00:00');
	});

	it('the fixed group and the status bar zones in order (§3, §4)', () => {
		expect(FIXED_GROUP.map((f) => f.label)).toEqual(['Vessel', 'Map', 'Space Center', 'VAB']);
		expect(activeFixed('/flight')).toBe('vessel');
		expect(activeFixed('/flight', true)).toBe('map');
		expect(activeFixed('/space-center')).toBe('spacecenter');
		expect(activeFixed('/mission-center')).toBeNull();
		expect([...STATUS_ZONES.left, ...STATUS_ZONES.centre, ...STATUS_ZONES.right]).toEqual([
			'world',
			'mode',
			'system',
			'link',
			'location',
			'funds',
			'science',
			'reputation',
			'contracts',
			'autosave',
			'mods',
			'bell'
		]);
	});
});
