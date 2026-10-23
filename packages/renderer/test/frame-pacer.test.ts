/** The frame-rate limit for the Space Center, Mission Center and Hangar loops (system audit). */
import { describe, expect, test } from 'bun:test';
import { FramePacer } from '../src/frame-pacer.ts';

const drawn = (pacer: FramePacer, hz: number, frames: number): number => {
	let n = 0;
	for (let i = 0; i < frames; i++) if (pacer.due((i * 1000) / hz)) n++;
	return n;
};

describe('FramePacer', () => {
	test('no cap draws every rAF', () => {
		expect(drawn(new FramePacer(), 120, 120)).toBe(120);
	});
	test('a 60 cap on a 120 Hz display draws every second rAF; 30 on 60 Hz every second', () => {
		const p = new FramePacer();
		p.setCap(60);
		expect(drawn(p, 120, 120)).toBe(60);
		const q = new FramePacer();
		q.setCap(30);
		expect(drawn(q, 60, 60)).toBe(30);
	});
	test('a cap at or above the display rate draws every rAF; null lifts it', () => {
		const p = new FramePacer();
		p.setCap(60);
		expect(drawn(p, 60, 60)).toBe(60);
		p.setCap(null);
		expect(drawn(p, 144, 144)).toBe(144);
	});
});
