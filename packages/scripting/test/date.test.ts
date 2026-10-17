/** date(t) (plan 081, ADR 0141): the host formats the game date; the sandbox has no clock. */
import { expect, test } from 'bun:test';
import type { DateProvider } from '../src/index.ts';
import { newRig } from './helpers.ts';

test('date() asks the host for now, date(t) for a given time; bad times are refused', async () => {
	const rig = await newRig();
	const calls: number[] = [];
	const date: DateProvider = (t) => {
		calls.push(t);
		return { text: `Day ${t}`, julianDate: 2_451_545 + t / 86_400 };
	};
	const run = await rig.runner(
		`
		print(JSON.stringify(date()));
		print(date(86400).text);
		for (const bad of [() => date(NaN), () => date('1')]) {
			try { bad(); print('no error'); } catch (e) { print('error'); }
		}
	`,
		{ date }
	);
	rig.advance(run);
	expect(run.status).toBe('finished');
	const now = calls[0]!;
	expect(JSON.parse(run.logs[0]!)).toEqual({
		text: `Day ${now}`,
		julianDate: 2_451_545 + now / 86_400
	});
	expect(run.logs.slice(1)).toEqual(['Day 86400', 'error', 'error']);
	expect(calls).toEqual([now, 86_400]);
	rig.sim.dispose();
});

test('without a provider date() says so', async () => {
	const rig = await newRig();
	const run = await rig.runner('date();');
	rig.advance(run);
	expect(run.status).toBe('failed');
	expect(run.error).toContain('not available in this host');
	rig.sim.dispose();
});
