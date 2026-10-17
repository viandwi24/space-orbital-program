/**
 * `date(t)` for scripts (plan 081, ADR 0141): the host formats the game date from the world epoch
 * and the root body's calendar; the sandbox never reads a clock (ADR 0039).
 */
import { calendarOf, formatDate } from '@orbital/core';
import type { DateProvider, ScriptEnvironment } from '@orbital/scripting';

export function scriptDate(env: Pick<ScriptEnvironment, 'bodies' | 'epoch'>): DateProvider {
	const calendar = calendarOf(env.bodies);
	const epoch = env.epoch ?? { day: 0, fraction: 0 };
	return (t) => {
		const d = formatDate(calendar, epoch, t);
		return { text: d.text, julianDate: d.julianDate };
	};
}
