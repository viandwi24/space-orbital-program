/** Ghosts (plan 131): the track of a replay's vessel and where it is at a time, on screen. */
import { describe, expect, it } from 'vitest';
import type { ReplayFile } from '@orbital/core';
import { ghostAt, ghostTrack, projectGhost } from './ghost-model';

const replay = {
	name: 'Run 1',
	start: { time: 100 },
	checkpoints: [
		{
			t: 100,
			n: 0,
			vessels: [
				{
					id: 3,
					mode: 'flight',
					soi: 'stock.home',
					position: [0, 0, 0],
					velocity: [0, 0, 0],
					parts: 3
				}
			]
		},
		{
			t: 110,
			n: 2,
			vessels: [
				{
					id: 3,
					mode: 'flight',
					soi: 'stock.home',
					position: [100, 0, 0],
					velocity: [0, 0, 0],
					parts: 3
				}
			]
		},
		{
			t: 120,
			n: 2,
			vessels: [
				{
					id: 3,
					mode: 'flight',
					soi: 'stock.home',
					position: [200, 50, 0],
					velocity: [0, 0, 0],
					parts: 2
				}
			]
		}
	]
} as unknown as ReplayFile;

describe('ghosts (plan 131)', () => {
	it('follows the first vessel and interpolates between checkpoints', () => {
		const track = ghostTrack(replay)!;
		expect(track.start).toBe(100);
		expect(track.points).toHaveLength(3);
		expect(ghostAt(track, 105)!.position).toEqual({ x: 50, y: 0, z: 0 });
		expect(ghostAt(track, 130)).toBeNull();
	});

	it('is drawn in the system frame: the track in map view, the ghost now in both', () => {
		const track = ghostTrack(replay)!;
		const snap = { bodies: [{ id: 'stock.home', position: { x: 1000, y: 0, z: 0 } }] } as never;
		const project = (w: { x: number; y: number }) => ({ x: w.x, y: w.y });
		expect(projectGhost(track, snap, 15, true, project)).toEqual({
			name: 'Run 1',
			path: [
				{ x: 1000, y: 0 },
				{ x: 1100, y: 0 },
				{ x: 1200, y: 50 }
			],
			at: { x: 1150, y: 25 }
		});
		expect(projectGhost(track, snap, 15, false, project).path).toEqual([]);
	});
});
