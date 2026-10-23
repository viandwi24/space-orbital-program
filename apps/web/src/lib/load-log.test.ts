import { describe, expect, it } from 'vitest';
import { summarize } from '@orbital/renderer/compile-report';
import {
	LOAD_LOG_LIMIT,
	bootPresetFor,
	formatLoadLog,
	pipelineList,
	summaryLine,
	upsertLog,
	type LoadLogEntry
} from './load-log';

const pipe = (label: string, ms: number | null, failed = false) => ({
	label,
	mode: 'async' as const,
	bytes: 2048,
	ms,
	phase: 'programs',
	at: 0,
	pending: ms === null && !failed,
	...(failed ? { failed: true } : {})
});

const entry = (id: string, outcome: LoadLogEntry['outcome'] = 'ready'): LoadLogEntry => ({
	id,
	worldId: 'w1',
	outcome,
	step: outcome === 'ready' ? 'ready' : 'programs',
	lowered: false,
	error: null,
	report: {
		when: '2026-10-22T10:00:00.000Z',
		env: {
			userAgent: 'UA',
			platform: 'Windows',
			cores: 8,
			memoryGB: 8,
			angle: 'ANGLE D3D11',
			build: 'b.js',
			origin: 'o'
		},
		backend: 'webgpu',
		gpu: 'gpu',
		preset: 'high',
		presetNow: 'high',
		warmPresets: [],
		steps: [],
		totalMs: outcome === 'ready' ? 12_000 : null,
		cache: 'first',
		seenBefore: null,
		changedModules: null,
		compile: summarize([], [pipe('planet', 9000)])
	},
	pipelines: pipelineList([pipe('small', 10), pipe('planet', 9000)])
});

describe('load log (plan 370)', () => {
	it('keeps pipelines slowest first, failures marked', () => {
		const list = pipelineList([pipe('a', 5), pipe('b', 50), pipe('c', null, true)]);
		expect(list.map((p) => p.label)).toEqual(['b', 'a', 'c']);
		expect(list[2]).toEqual({
			label: 'c',
			mode: 'async',
			bytes: 2048,
			ms: null,
			phase: 'programs',
			failed: true
		});
	});

	it('replaces an entry by id in place and keeps the last 20', () => {
		let list: LoadLogEntry[] = [];
		list = upsertLog(list, entry('a', 'loading'));
		list = upsertLog(list, entry('b'));
		list = upsertLog(list, entry('a'));
		expect(list.map((e) => [e.id, e.outcome])).toEqual([
			['a', 'ready'],
			['b', 'ready']
		]);
		for (let i = 0; i < 30; i++) list = upsertLog(list, entry(`n${i}`));
		expect(list.length).toBe(LOAD_LOG_LIMIT);
		expect(list.at(-1)!.id).toBe('n29');
	});

	it('formats an entry and a list line', () => {
		const e = { ...entry('x', 'left'), lowered: true };
		const text = formatLoadLog(e);
		expect(text).toContain(
			'outcome: left while loading at step programs · continued with lower quality'
		);
		expect(text).toContain('9000 ms · async · 2 KB · programs · planet');
		const line = summaryLine(e);
		expect(line.total).toBe('left while loading');
		expect(line.slowest).toBe('planet 9.0 s');
	});

	it('boots on low on a first Windows load of this build, not after one finished', () => {
		const base = {
			backend: 'webgpu',
			preset: 'high',
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154',
			platform: 'Windows',
			build: 'b.js',
			logs: [] as LoadLogEntry[],
			override: null
		};
		expect(bootPresetFor(base)).toBe('low');
		expect(bootPresetFor({ ...base, logs: [entry('a')] })).toBeUndefined();
		expect(bootPresetFor({ ...base, logs: [entry('a', 'left')] })).toBe('low');
		expect(bootPresetFor({ ...base, build: 'other.js', logs: [entry('a')] })).toBe('low');
		expect(bootPresetFor({ ...base, preset: 'low' })).toBeUndefined();
		expect(bootPresetFor({ ...base, backend: 'webgl' })).toBeUndefined();
		expect(bootPresetFor({ ...base, platform: 'macOS', userAgent: 'Macintosh' })).toBeUndefined();
		expect(
			bootPresetFor({ ...base, platform: 'macOS', userAgent: 'Macintosh', override: 'low' })
		).toBe('low');
		expect(bootPresetFor({ ...base, override: 'off' })).toBeUndefined();
	});
});
