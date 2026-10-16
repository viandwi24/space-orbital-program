import { describe, expect, test } from 'bun:test';
import { partDefinitionSchema, partVisualSchema } from '../src/index.ts';

const base = { id: 'mod.thing', title: 'Thing', mass: 10 };

describe('part visual descriptor (ADR 0028)', () => {
	test('a part without a visual stays valid; one with a full visual parses', () => {
		expect(partDefinitionSchema.safeParse(base).success).toBe(true);
		const visual = {
			kind: 'engine',
			palette: { primary: '#2d3138', accent: '#B0642E' },
			params: { bellExit: 0.47, label: 'x', flag: true },
			plume: { module: 'mod.engine', nozzle: [0, -0.6, 0], exitRadius: 0.4, length: 6 },
			deploy: { module: 'mod.leg', flag: 'deployed', seconds: 1 }
		};
		const parsed = partDefinitionSchema.safeParse({ ...base, visual });
		expect(parsed.success).toBe(true);
	});

	test('bad colours, empty kinds, non-positive sizes and nested params are refused', () => {
		const bad = [
			{ kind: '' },
			{ kind: 'tank', palette: { primary: 'red' } },
			{ kind: 'tank', palette: { primary: '#fff' } },
			{ kind: 'tank', params: { a: { nested: 1 } } },
			{ kind: 'engine', plume: { module: 'mod.e', nozzle: [0, 0, 0], exitRadius: 0, length: 5 } },
			{ kind: 'engine', plume: { module: 'engine', nozzle: [0, 0, 0], exitRadius: 1, length: 5 } },
			{ kind: 'legs', deploy: { module: 'mod.leg', flag: '' } }
		];
		for (const v of bad) expect(partVisualSchema.safeParse(v).success).toBe(false);
	});
});
