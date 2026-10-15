import { describe, expect, test } from 'bun:test';
import { API_VERSION, CORE_VERSION } from '../src/index.ts';

describe('@orbital/core smoke', () => {
	test('exports versions', () => {
		expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
		expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
