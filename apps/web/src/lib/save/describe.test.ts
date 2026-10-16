import { describe, expect, it } from 'vitest';
import { ago, summaryLine } from './describe';

const base = {
	vessel: 'Two-stage',
	mode: 'flight' as const,
	altitude: 12_400,
	simTime: 150,
	vessels: 1,
	warp: 1
};

describe('summaryLine', () => {
	it('flight with altitude', () => {
		expect(summaryLine(base)).toBe('Two-stage · flying at 12.4 km · T+02:30');
	});
	it('rails, extra vessels and warp', () => {
		expect(summaryLine({ ...base, mode: 'on-rails', altitude: null, vessels: 3, warp: 100 })).toBe(
			'Two-stage · on rails · 3 vessels · 100x · T+02:30'
		);
	});
	it('flight without a known altitude', () => {
		expect(summaryLine({ ...base, altitude: null })).toBe('Two-stage · flying · T+02:30');
	});
});

describe('ago', () => {
	const now = 10_000_000;
	it.each([
		[now - 10_000, 'just now'],
		[now - 5 * 60_000, '5 min ago'],
		[now - 3 * 3_600_000, '3 h ago'],
		[now - 86_400_000, '1 day ago'],
		[now - 3 * 86_400_000, '3 days ago']
	])('%s', (t, text) => {
		expect(ago(t, now)).toBe(text);
	});
});
