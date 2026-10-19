/** The in-memory log (plan 202): order, the 2000-entry ring, the level filter. */
import { describe, expect, it } from 'vitest';
import { LOG_CAPACITY, createLogBuffer } from './log-buffer';

describe('log buffer', () => {
	it('keeps entries in the order they came, with their time and source', () => {
		let t = 100;
		const log = createLogBuffer(LOG_CAPACITY, () => t++);
		log.add('info', 'sim', 'a');
		log.add('error', 'page', 'b');
		log.add('warn', 'command', 'c');
		expect(log.entries()).toEqual([
			{ level: 'info', time: 100, source: 'sim', message: 'a' },
			{ level: 'error', time: 101, source: 'page', message: 'b' },
			{ level: 'warn', time: 102, source: 'command', message: 'c' }
		]);
	});

	it('drops the oldest past 2000 entries', () => {
		const log = createLogBuffer();
		for (let i = 0; i < LOG_CAPACITY + 7; i++) log.add('debug', 'test', String(i));
		const list = log.entries();
		expect(list).toHaveLength(2000);
		expect(list[0]!.message).toBe('7');
		expect(list.at(-1)!.message).toBe(String(LOG_CAPACITY + 6));
	});

	it('filters by level: the level and everything above it', () => {
		const log = createLogBuffer();
		for (const level of ['debug', 'info', 'warn', 'error'] as const) log.add(level, 'x', level);
		expect(log.atLeast('warn').map((e) => e.message)).toEqual(['warn', 'error']);
		expect(log.atLeast('debug')).toHaveLength(4);
	});
});
