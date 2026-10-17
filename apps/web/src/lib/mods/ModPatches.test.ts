/** The provenance view of the mod manager (plan 079): the sample mod's patch, rendered server-side. */
import { loadPlugins, type PatchReport } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Sample from '../../../../../examples/mod-sample/src/index.ts';
import ModPatches from './ModPatches.svelte';

const html = (patches: readonly PatchReport[]) => render(ModPatches, { props: { patches } }).body;
/** Visible text: tags and SSR markers removed, whitespace collapsed. */
const text = (body: string) =>
	body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ');

describe('ModPatches', () => {
	it("shows the sample mod's patch: entry, path, old and new value, and who patched it", () => {
		const { report } = loadPlugins([Stock, Sample]);
		const mine = report.patches.filter((p) => p.by === 'sample');
		expect(mine.map((p) => p.id)).toEqual(['sample.engine-lv-thrust']);
		const body = html(mine);
		expect(body).toContain('stock.engine-lv');
		expect(body).toContain('modules.stock.engine.thrust');
		expect(body).toContain('215,000 → 230,000');
		expect(text(body)).toContain(
			'stock.engine-lv · modules.stock.engine.thrust · 215,000 → 230,000, patched by sample'
		);
	});

	it('shows why a patch did not apply, and nothing for a mod without patches', () => {
		const body = html([
			{
				id: 'bad.mass',
				by: 'bad',
				target: 'part',
				applied: [],
				changes: [],
				disabled: 'part "stock.tank" would be invalid: mass must be at least 0'
			}
		]);
		expect(body).toContain('bad.mass');
		expect(body).toContain('did not apply');
		expect(body).toContain('would be invalid');
		expect(html([])).not.toContain('<ul');
	});
});
