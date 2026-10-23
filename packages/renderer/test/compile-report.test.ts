import { describe, expect, it } from 'bun:test';
import { CompileReport, hashSource, stableShaderNames, summarize } from '../src/compile-report.ts';

describe('compile report (plan 370)', () => {
	it('hashes a source the same way every time, and two sources apart', () => {
		expect(hashSource('fn main() {}')).toBe(hashSource('fn main() {}'));
		expect(hashSource('fn main() {}')).not.toBe(hashSource('fn main() { }'));
		expect(hashSource('')).toMatch(/^[0-9a-f]{8}$/);
	});

	it("renumbers three's NodeBuffer names in order of appearance", () => {
		const a =
			'struct NodeBuffer_1348856Struct {};\nvar<uniform> NodeBuffer_1348856 : NodeBuffer_1348856Struct;\nvar<uniform> NodeBuffer_77 : X;';
		const b =
			'struct NodeBuffer_1351320Struct {};\nvar<uniform> NodeBuffer_1351320 : NodeBuffer_1351320Struct;\nvar<uniform> NodeBuffer_80 : X;';
		expect(stableShaderNames(a)).toBe(stableShaderNames(b));
		expect(stableShaderNames(a)).toContain('NodeBuffer_0Struct');
		expect(stableShaderNames(a)).toContain('NodeBuffer_1 : X');
		expect(stableShaderNames('nodeUniform3')).toBe('nodeUniform3');
	});

	it('summarises modules and pipelines: totals, slowest, phases and a set hash', () => {
		const r = new CompileReport();
		r.addModule('planet', 'fragment', 'x'.repeat(1000));
		r.addModule('part', 'vertex', 'y'.repeat(10));
		r.phase = 'programs';
		const slow = r.addPipeline('planet', 'async', 1010);
		const fast = r.addPipeline('part', 'async', 10);
		r.addPipeline('bake', 'sync', 5);
		expect(r.pending).toBe(2);
		r.done(fast);
		r.done(slow);
		slow.ms = 900;
		fast.ms = 20;
		const s = r.summary();
		expect(s.modules).toBe(2);
		expect(s.moduleBytes).toBe(1010);
		expect(s.pipelines).toBe(3);
		expect(s.sync).toBe(1);
		expect(s.async).toBe(2);
		expect(s.pending).toBe(0);
		expect(s.timedMs).toBe(920);
		expect(s.slowest.map((p) => p.label)).toEqual(['planet', 'part']);
		expect(s.largest[0]!.label).toBe('planet');
		expect(s.phases).toEqual([
			{ phase: 'programs', pipelines: 3, timedMs: 920, spanMs: expect.any(Number) }
		]);
	});

	it('gives the same set hash for the same shaders in any order', () => {
		const m = (h: string) => ({ label: '', stage: 'fragment', bytes: 1, hash: h });
		expect(summarize([m('a'), m('b')], []).setHash).toBe(
			summarize([m('b'), m('a'), m('a')], []).setHash
		);
		expect(summarize([m('a')], []).setHash).not.toBe(summarize([m('b')], []).setHash);
	});

	it('keeps sources only when asked', () => {
		const r = new CompileReport();
		r.addModule('a', 'vertex', 'code');
		expect(r.sources()).toEqual([]);
		r.keepSources = true;
		r.addModule('b', 'fragment', 'more');
		expect(r.sources()).toEqual([{ label: 'fragment-b', code: 'more' }]);
	});
});
