/**
 * Owner, 2026-10-21: a flying vessel's part panel threw "returned an invalid descriptor" for a lamp.
 * In flight `describe` reads the module's snapshot view, not its state: every stock part's panel
 * must be valid both ways.
 */
import { describe, expect, test } from 'bun:test';
import { describeModule, parseModuleConfig } from '@orbital/sdk';
import { loaded } from './helpers.ts';

describe('part panels from a live snapshot', () => {
	test('every module of every stock part describes itself from its snapshot view', () => {
		const bad: string[] = [];
		for (const part of loaded.registries.parts.list()) {
			for (const [id, raw] of part.modules ?? []) {
				const module = loaded.registries.modules.get(id);
				if (!module?.describe || !module.snapshot) continue;
				const config = parseModuleConfig(module, raw);
				if (!config.ok) continue;
				const view = module.snapshot(module.state?.(config.value as never) as never);
				try {
					describeModule(module, raw, view);
				} catch (e) {
					bad.push(`${part.id} ${id}: ${(e as Error).message.split('\n')[0]}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
