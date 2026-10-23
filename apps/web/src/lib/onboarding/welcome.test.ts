/** The welcome per mode (player-journey audit Q8, ADR 0328): what each stock preset tells a new player. */
import { loadPlugins } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import { modeWelcome } from './welcome';

const { registries } = loadPlugins([...BUILTIN_PLUGINS]);
const welcome = (preset: string, rules: Record<string, string | number | boolean> = {}) =>
	modeWelcome({ preset, rules }, registries);

describe('the welcome per mode', () => {
	it('names the mode, and says where the money and the parts come from', () => {
		const sandbox = welcome('stock.sandbox');
		expect(sandbox.mode).toBe('Sandbox');
		expect(sandbox.first).toMatch(/nothing costs money/);
		const science = welcome('stock.science');
		expect(science.mode).toBe('Science');
		expect(science.first).toMatch(/^Nothing costs money here\. Experiments earn science/);
		const career = welcome('stock.career');
		expect(career.mode).toBe('Career');
		expect(career.summary).toMatch(/Funds, contracts/);
		expect(career.first).toMatch(/budget each month/);
		expect(career.first).toMatch(/R&D turns it into new parts/);
	});

	it('a company is told it has no budget, and where its money comes from', () => {
		const company = welcome('stock.career', { 'stock.agency-type': 'company' });
		expect(company.first).toMatch(/^A company has no monthly budget/);
		expect(company.first).toMatch(/loan in Administration/);
	});

	it('a rule the world changed wins over its preset', () => {
		expect(welcome('stock.career', { 'stock.economy': false }).first).toMatch(
			/^Nothing costs money here/
		);
	});
});
