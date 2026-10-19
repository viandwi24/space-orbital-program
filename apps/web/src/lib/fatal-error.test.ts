/** The error card's state (plan 202). */
import { afterEach, describe, expect, it } from 'vitest';
import { describeError, dismissFatal, fatal, reportFatal } from './fatal-error.svelte';
import { createLogBuffer } from './log-buffer';

afterEach(() => dismissFatal());

describe('error card', () => {
	it('logs every error and shows the first until dismissed', () => {
		const log = createLogBuffer();
		reportFatal({ kind: 'rejection', message: 'first' }, log);
		reportFatal({ kind: 'error', message: 'second' }, log);
		expect(fatal.current).toEqual({ kind: 'rejection', message: 'first' });
		expect(log.entries().map((e) => e.message)).toEqual(['unhandled rejection: first', 'second']);
		dismissFatal();
		reportFatal({ kind: 'error', message: 'third' }, log);
		expect(fatal.current?.message).toBe('third');
	});

	it('browser noise is a warning, not a card', () => {
		const log = createLogBuffer();
		reportFatal(
			{ kind: 'error', message: 'ResizeObserver loop completed with undelivered notifications.' },
			log
		);
		expect(fatal.current).toBeNull();
		expect(log.atLeast('warn')).toHaveLength(1);
	});

	it('describes anything thrown in one line', () => {
		expect(describeError(new Error('boom'))).toBe('boom');
		expect(describeError('plain')).toBe('plain');
		expect(describeError({ code: 3 })).toBe('{"code":3}');
	});
});
