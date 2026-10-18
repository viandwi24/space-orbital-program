/** Plan 203: the Debug panel's Log tab and Set orbit presets. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { createLogBuffer } from '../log-buffer';
import {
	filterLog,
	formatLogLine,
	fromApsides,
	logFileName,
	logText,
	orbitPresets,
	simEventLine
} from './model';

function sample() {
	let t = Date.UTC(2026, 9, 19, 14, 3, 7, 215);
	const log = createLogBuffer(2000, () => t++);
	log.add('info', 'sim', 'stage 0 fired on vessel 3');
	log.add('warn', 'command', 'warp refused: time warp needs every vessel on rails');
	log.add('error', 'page', 'TypeError: x is undefined');
	log.add('debug', 'sim', 'noise');
	return log;
}

describe('the Log tab', () => {
	it('filters by level and by text', () => {
		const entries = sample().entries();
		expect(filterLog(entries, { levels: ['warn', 'error'] }).map((e) => e.source)).toEqual([
			'command',
			'page'
		]);
		expect(filterLog(entries, { levels: [] })).toHaveLength(4);
		expect(filterLog(entries, { levels: [], text: 'WARP' }).map((e) => e.level)).toEqual(['warn']);
	});

	it('copy returns exactly the visible lines, oldest first', () => {
		const visible = filterLog(sample().entries(), { levels: ['info', 'warn'] });
		expect(logText(visible)).toBe(
			[
				'14:03:07.215 INFO  sim      stage 0 fired on vessel 3',
				'14:03:07.216 WARN  command  warp refused: time warp needs every vessel on rails'
			].join('\n')
		);
		expect(formatLogLine(visible[0]!)).toContain('INFO');
	});

	it('download names the file with the world and the date', () => {
		expect(logFileName('My Career (2)', new Date(Date.UTC(2026, 9, 19, 23, 0)))).toBe(
			'orbital-log-my-career-2-2026-10-19.txt'
		);
		expect(logFileName('', new Date(Date.UTC(2026, 0, 2)))).toBe(
			'orbital-log-world-2026-01-02.txt'
		);
	});

	it('the ring keeps the newest 2000 entries', () => {
		const log = createLogBuffer(2000, () => 0);
		for (let i = 0; i < 2005; i++) log.add('info', 'sim', String(i));
		expect(log.entries()).toHaveLength(2000);
		expect(log.entries()[0]!.message).toBe('5');
		expect(log.atLeast('warn')).toHaveLength(0);
	});

	it('an explosion is a warning with its cause', () => {
		expect(
			simEventLine({
				type: 'part-damaged',
				vessel: 2,
				part: 7,
				definition: 'stock.tank-small',
				speed: 41.25,
				outcome: 'destroyed',
				cause: 'impact'
			})
		).toEqual({
			level: 'warn',
			message: 'stock.tank-small on vessel 2 exploded: impact at 41.3 m/s'
		});
	});
});

describe('Set orbit', () => {
	it('turns apsides into a and e', () => {
		const { a, e } = fromApsides(600_000, 200_000, 100_000);
		expect(a).toBe(750_000);
		expect(e).toBeCloseTo(100_000 / 1_500_000, 12);
	});

	it('offers low orbit, the moon and a transfer to it', () => {
		const bodies = loadPlugins([Stock]).registries.bodies.list();
		const presets = orbitPresets(bodies, 'stock.home');
		expect(presets.map((p) => p.label)).toEqual([
			'Low orbit',
			'Cinder orbit',
			'Transfer to Cinder'
		]);
		const home = bodies.find((b) => b.id === 'stock.home')!;
		const low = presets[0]!.orbit;
		expect(low.a - home.radius).toBe(home.atmosphere!.height + 10_000);
		const transfer = presets[2]!.orbit;
		const cinder = bodies.find((b) => b.id === 'stock.cinder')!;
		expect(transfer.a * (1 + transfer.e)).toBeCloseTo(cinder.orbit!.a, 3);
		expect(transfer.a * (1 - transfer.e)).toBeCloseTo(low.a, 3);
	});
});
