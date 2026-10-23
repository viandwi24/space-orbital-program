import { describe, expect, it } from 'vitest';
import { insideLook, insideStep, pickableInside, shellOf } from './inside-mode';

// part 1 is a bay holding 2 and 3; part 3 is a fairing inside the bay holding 4
const shells = new Map<number, number[]>([
	[1, [2, 3, 4]],
	[3, [4]]
]);

describe('inside mode (plan 378, ADR 0315)', () => {
	it('a double click on a shell enters it', () => {
		expect(insideStep(null, { kind: 'double', index: 1 }, shells)).toBe(1);
	});

	it('a double click on a held part enters its innermost shell', () => {
		expect(insideStep(null, { kind: 'double', index: 2 }, shells)).toBe(1);
		expect(insideStep(null, { kind: 'double', index: 4 }, shells)).toBe(3);
		expect(shellOf(shells, 4)).toBe(3);
	});

	it('inside, a double click on a held shell goes one level in, on a held part stays', () => {
		expect(insideStep(1, { kind: 'double', index: 3 }, shells)).toBe(3);
		expect(insideStep(1, { kind: 'double', index: 2 }, shells)).toBe(1);
	});

	it('a double click on a part outside any shell does not enter', () => {
		expect(insideStep(null, { kind: 'double', index: 0 }, shells)).toBeNull();
	});

	it('Esc and the breadcrumb leave', () => {
		expect(insideStep(1, { kind: 'exit' }, shells)).toBeNull();
	});

	it('deleting the shell leaves; a design change that keeps it stays', () => {
		expect(insideStep(3, { kind: 'design' }, new Map([[1, [2]]]))).toBeNull();
		expect(insideStep(1, { kind: 'design' }, shells)).toBe(1);
	});

	it('the Parts list enters the shell of a held part and leaves for any other', () => {
		expect(insideStep(null, { kind: 'list', index: 2 }, shells)).toBe(1);
		expect(insideStep(1, { kind: 'list', index: 0 }, shells)).toBeNull();
	});

	it('"Edit inside" enters a shell only', () => {
		expect(insideStep(null, { kind: 'edit', index: 1 }, shells)).toBe(1);
		expect(insideStep(null, { kind: 'edit', index: 2 }, shells)).toBeNull();
	});

	it('inside, only what the shell holds is picked; the shell is a veil, the rest dim', () => {
		expect(pickableInside(1, 2, shells)).toBe(true);
		expect(pickableInside(1, 0, shells)).toBe(false);
		expect(pickableInside(1, 1, shells)).toBe(false);
		expect(pickableInside(null, 0, shells)).toBe(true);
		expect(insideLook(1, 1, shells)).toBe('veil');
		expect(insideLook(1, 2, shells)).toBeNull();
		expect(insideLook(1, 0, shells)).toBe('dim');
		expect(insideLook(null, 0, shells)).toBeNull();
	});
});
