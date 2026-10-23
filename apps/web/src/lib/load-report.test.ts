import { describe, expect, it } from 'vitest';
import { summarize } from '@orbital/renderer/compile-report';
import {
	changedSince,
	formatLoadReport,
	moduleKey,
	remember,
	stepTimes,
	type LoadReportData
} from './load-report';

const mod = (hash: string, bytes = 100) => ({ label: 'planet', stage: 'fragment', bytes, hash });

describe('load report (plan 370)', () => {
	it('times each step until the next one, and the total until ready', () => {
		const t = stepTimes(
			{ sim: 0, device: 1000, programs: 1500, views: 41_500, frame: 42_000 },
			42_100
		);
		expect(t.steps).toEqual([
			{ step: 'sim', ms: 1000 },
			{ step: 'device', ms: 500 },
			{ step: 'programs', ms: 40_000 },
			{ step: 'views', ms: 500 },
			{ step: 'frame', ms: 100 }
		]);
		expect(t.totalMs).toBe(42_100);
		expect(stepTimes({ device: 10 }, null)).toEqual({
			steps: [{ step: 'device', ms: 0 }],
			totalMs: null
		});
	});

	it('counts the modules a previous load did not have', () => {
		expect(changedSince([mod('a'), mod('b')], undefined)).toBeNull();
		expect(changedSince([mod('a'), mod('b')], ['a', 'b'])).toBe(0);
		expect(changedSince([mod('a'), mod('c')], ['a', 'b'])).toBe(1);
	});

	it('remembers loads per shader set and keeps at most 20 sets', () => {
		let m = { sets: {}, modules: {} } as Parameters<typeof remember>[0];
		m = remember(m, 'set1', 40_000, moduleKey('webgpu', 'high'), [mod('a'), mod('a')]);
		m = remember(m, 'set1', 9_000, moduleKey('webgpu', 'high'), [mod('a')]);
		expect(m.sets.set1).toEqual({ loads: 2, lastMs: 9_000 });
		expect(m.modules['webgpu:high']).toEqual(['a']);
		for (let i = 0; i < 30; i++) m = remember(m, `s${i}`, 1, 'k', []);
		expect(Object.keys(m.sets).length).toBe(20);
		expect(m.sets.s29).toBeDefined();
	});

	it('formats a report a player can paste', () => {
		const compile = summarize(
			[mod('a', 300_000)],
			[
				{
					label: 'renderPipeline_planet-pass-tsl_1',
					mode: 'async',
					bytes: 300_000,
					ms: 12_300,
					phase: 'programs',
					at: 0,
					pending: false
				}
			]
		);
		const data: LoadReportData = {
			when: '2026-10-22T10:00:00.000Z',
			env: {
				userAgent: 'Chrome/141 Windows',
				platform: 'Windows',
				cores: 16,
				memoryGB: 8,
				angle: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
				build: 'abc.js',
				origin: 'https://example.github.io'
			},
			backend: 'webgpu',
			gpu: 'WebGPU: nvidia ampere',
			preset: 'high',
			presetNow: 'high',
			warmPresets: ['medium'],
			steps: [{ step: 'programs', ms: 40_000 }],
			totalMs: 42_000,
			cache: 'first',
			seenBefore: null,
			changedModules: null,
			compile
		};
		const text = formatLoadReport(data);
		expect(text).toContain('Renderer: webgpu · WebGPU: nvidia ampere');
		expect(text).toContain('D3D11');
		expect(text).toContain('compiling 40.0 s · total 42.0 s');
		expect(text).toContain('first time these shaders were compiled');
		expect(text).toContain('1. renderPipeline_planet-pass-tsl_1 12.3 s · 293 KB · programs');
		expect(text).toContain('(next, built after loading: medium)');
	});
});
