import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { boosterRocket } from './examples';
import { stabilityOf } from './stability';
import { createEditor } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

describe('booster rocket example', () => {
	it('has the 23 parts of the plan 026 vessel and is stable with its low fins', () => {
		const d = boosterRocket(content);
		expect(d.parts).toHaveLength(23);
		expect(d.parts.filter((p) => p.part === 'stock.fin')).toHaveLength(4);
		const s = stabilityOf(d, { ...content, resources: registries.resources });
		expect(s.fins).toBe(4);
		expect(s.state).not.toBe('unstable');
		expect(createEditor(d, content).design.stages.length).toBeGreaterThan(1);
	});
});
