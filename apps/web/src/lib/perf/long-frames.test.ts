import { describe, expect, it } from 'vitest';
import { LongFrameLog } from './long-frames';

/** Steady frames of `ms` from `t`, `n` of them; returns the time after. */
function steady(log: LongFrameLog, t: number, n: number, ms = 5.6): number {
	for (let i = 0; i < n; i++) log.frame((t += ms));
	return t;
}

describe('LongFrameLog (plan 408)', () => {
	it('records only frames over twice the usual interval', () => {
		const log = new LongFrameLog();
		let t = steady(log, 0, 200);
		expect(log.total).toBe(0);
		log.frame((t += 11)); // 2x is not over
		expect(log.total).toBe(0);
		log.frame((t += 40));
		expect(log.list()).toHaveLength(1);
		expect(log.list()[0]).toMatchObject({ ms: 40, cause: 'unknown' });
	});

	it('tags a frame with the latest mark that fell inside it', () => {
		const log = new LongFrameLog();
		let t = steady(log, 0, 200);
		log.mark('warm', t + 2);
		log.mark('governor', t + 10);
		log.frame((t += 60));
		expect(log.list().at(-1)!.cause).toBe('governor');
		t = steady(log, t, 50);
		// a mark from long before does not tag this frame
		log.frame((t += 60));
		expect(log.list().at(-1)!.cause).toBe('unknown');
	});

	it('says gc when the heap dropped by 20 MB or more and nothing else is marked', () => {
		const log = new LongFrameLog();
		let t = steady(log, 0, 100);
		log.frame((t += 5.6), 400 * 1024 * 1024);
		log.frame((t += 40), 240 * 1024 * 1024);
		expect(log.list().at(-1)!.cause).toBe('gc');
	});

	it('ignores a pause, adapts to a slower display, and keeps the last `capacity`', () => {
		const log = new LongFrameLog(4);
		let t = steady(log, 0, 50);
		log.frame((t += 30_000));
		expect(log.total).toBe(0);
		t = steady(log, t, 800, 16.7);
		log.frame((t += 20));
		expect(log.total).toBe(0);
		for (let i = 0; i < 9; i++) {
			t = steady(log, t, 30, 16.7);
			log.frame((t += 100 + i));
		}
		expect(log.total).toBe(9);
		expect(log.list()).toHaveLength(4);
		expect(log.list().map((f) => Math.round(f.ms))).toEqual([105, 106, 107, 108]);
		expect(log.counts().unknown).toBe(4);
	});
});
