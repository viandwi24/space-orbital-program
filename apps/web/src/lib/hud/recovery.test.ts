/** The Recover dialog (plan 132, ADR 0113 point 6); the funds are in the status bar since plan 204. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { formatFunds } from '../format';
import RecoverDialog from './RecoverDialog.svelte';
import { recoveryLines } from './recovery-model';

const quote = { value: 12_000, factor: 0.98, distance: 150, credit: 11_760 };

describe('recovery in the HUD', () => {
	it('lists the value, distance, factor and credit of the quote', () => {
		const lines = recoveryLines(quote);
		expect(lines.map((l) => l.label)).toEqual([
			'Value of parts and contents',
			'Distance to the recovery site',
			'Recovery factor',
			'Credit'
		]);
		expect(lines[0]!.value).toBe(formatFunds(12_000));
		expect(lines[2]!.value).toBe('98 %');
		expect(lines[3]!.value).toBe(formatFunds(11_760));
		expect(recoveryLines({ ...quote, distance: null })[1]!.value).toBe('Not on the home planet');
	});
	it('fuel that goes to the site storage is its own line, before the credit (system audit D2)', () => {
		const lines = recoveryLines({
			value: 10_000,
			factor: 1,
			distance: 50,
			credit: 6_000,
			stored: [
				{ commodity: 'stock.liquid-fuel', amount: 800 },
				{ commodity: 'stock.oxidizer', amount: 977.6 }
			]
		});
		expect(lines.at(-2)).toEqual({
			label: "To the site's storage",
			value: '800 u liquid fuel, 978 u oxidizer'
		});
		expect(lines.at(-1)!.label).toBe('Credit');
	});

	it('the dialog shows the lines and a Recover button', () => {
		const { body } = render(RecoverDialog, {
			props: { open: true, quote, onrecover: () => {}, onclose: () => {} }
		});
		expect(body).toContain('98 %');
		expect(body).toContain(formatFunds(11_760));
		expect(body).toContain('recover-confirm');
	});
});
