/** The funds capsule and the Recover dialog (plan 132, ADR 0113 point 6). */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { formatFunds } from '../format';
import FundsCapsule from './FundsCapsule.svelte';
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
	it('the dialog shows the lines and a Recover button', () => {
		const { body } = render(RecoverDialog, {
			props: { open: true, quote, onrecover: () => {}, onclose: () => {} }
		});
		expect(body).toContain('98 %');
		expect(body).toContain(formatFunds(11_760));
		expect(body).toContain('recover-confirm');
	});
	it('the funds capsule shows the funds', () => {
		const { body } = render(FundsCapsule, { props: { funds: 25_000 } });
		expect(body).toContain('hud-funds');
		expect(body).toContain(formatFunds(25_000));
	});
});
