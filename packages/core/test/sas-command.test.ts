/** Plan 042 / ADR 0049: the `sas` command at the protocol boundary. */
import { describe, expect, test } from 'bun:test';
import { API_VERSION, SAS_MODES, commandSchema } from '../src/index.ts';

describe('sas command', () => {
	test('every mode parses; mode and reference are each optional', () => {
		for (const mode of SAS_MODES) {
			expect(commandSchema.safeParse({ type: 'sas', vessel: 1, mode }).success).toBe(true);
		}
		expect(commandSchema.safeParse({ type: 'sas', vessel: 1, reference: 'orbit' }).success).toBe(
			true
		);
		expect(commandSchema.safeParse({ type: 'sas', vessel: 1 }).success).toBe(true);
	});

	test('unknown modes and references are rejected', () => {
		expect(commandSchema.safeParse({ type: 'sas', vessel: 1, mode: 'sideways' }).success).toBe(
			false
		);
		expect(commandSchema.safeParse({ type: 'sas', vessel: 1, reference: 'target' }).success).toBe(
			false
		);
		expect(commandSchema.safeParse({ type: 'sas', mode: 'hold' }).success).toBe(false);
	});

	test('the mod API version carries the control authority hook', () => {
		expect(API_VERSION).toBe('0.1.11');
	});
});
