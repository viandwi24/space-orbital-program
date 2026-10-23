/** Plan 312: a blueprint with locked parts opens read-only until the player makes an editable copy. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { VabController } from './controller.svelte';

beforeAll(() => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
});

describe('a locked blueprint (plan 312)', () => {
	it('opens read-only, refuses edits, and an editable copy lifts it', () => {
		const vab = new VabController({ sandbox: true });
		// the first card with a part the tree locks, with nothing researched
		vab.tech = { on: true, researched: [] };
		const locked = vab.blueprints.find((b) => vab.blueprintLocks(b.id).length > 0);
		expect(locked, 'a stock blueprint needs a locked part with nothing researched').toBeDefined();
		vab.loadBlueprint(locked!.id);
		expect(vab.readOnly?.title).toBe(locked!.title);
		expect(vab.readOnly!.locks.length).toBeGreaterThan(0);
		const before = vab.editor;
		vab.editor = { ...before, design: { ...before.design, name: 'Changed' } };
		expect(vab.editor).toBe(before);
		expect(vab.notice).toContain('read-only');
		vab.makeEditableCopy();
		expect(vab.readOnly).toBeNull();
		const next = { ...before, design: { ...before.design, name: 'Changed' } };
		vab.editor = next;
		expect(vab.editor).toBe(next);
	});

	it('an unlocked blueprint loads as usual', () => {
		const vab = new VabController({ sandbox: true });
		vab.tech = { on: false, researched: [] };
		const any = vab.blueprints[0]!;
		vab.loadBlueprint(any.id);
		expect(vab.readOnly).toBeNull();
		expect(vab.editor.design.parts.length).toBeGreaterThan(0);
	});

	it('a card says which parts are locked, and none with the tree off', () => {
		const vab = new VabController({ sandbox: true });
		vab.tech = { on: false, researched: [] };
		expect(vab.blueprints.every((b) => vab.blueprintLocks(b.id).length === 0)).toBe(true);
	});
});
