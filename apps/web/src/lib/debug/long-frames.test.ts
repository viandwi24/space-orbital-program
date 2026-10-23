import { describe, expect, it } from 'vitest';
import {
	LONG_FRAMES_KEPT,
	LongFrameLog,
	describeLongFrame,
	observeLongFrames
} from './long-frames';

describe('long animation frames (plan 396)', () => {
	it('keeps the newest few, with the longest scripts named', () => {
		const log = new LongFrameLog();
		for (let i = 0; i < LONG_FRAMES_KEPT + 3; i++) {
			log.add({
				startTime: i * 100,
				duration: 60 + i,
				blockingDuration: 10 + i,
				scripts: [
					{ sourceURL: 'https://x.test/assets/a.js?v=1', duration: 5 },
					{
						sourceFunctionName: 'frame',
						sourceURL: 'https://x.test/assets/flight-loop.js',
						duration: 40
					},
					{ invoker: 'TimerHandler:setTimeout', duration: 8 },
					{ invoker: 'tiny', duration: 1 }
				]
			});
		}
		const recent = log.recent();
		expect(recent).toHaveLength(LONG_FRAMES_KEPT);
		expect(log.total).toBe(LONG_FRAMES_KEPT + 3);
		expect(recent[0]!.start).toBe((LONG_FRAMES_KEPT + 2) * 100);
		expect(recent[0]!.scripts.map((s) => s.invoker)).toEqual([
			'frame',
			'TimerHandler:setTimeout',
			''
		]);
		expect(describeLongFrame(recent[0]!)).toContain('flight-loop.js frame');
		log.clear();
		expect(log.recent()).toEqual([]);
	});

	it('does nothing where the browser lacks the entry type', () => {
		expect(observeLongFrames(new LongFrameLog())).toBeNull();
	});
});
