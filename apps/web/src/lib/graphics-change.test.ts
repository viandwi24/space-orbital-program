/** Settings opened from any menu reach the page drawing now (owner, 2026-10-22). */
import { describe, expect, it } from 'vitest';
import { emitGraphicsChange, onGraphicsChange, type GraphicsChange } from './graphics';

describe('graphics changes', () => {
	it('reach every listener until it unsubscribes', () => {
		const seen: GraphicsChange[] = [];
		const off = onGraphicsChange((c) => seen.push(c));
		emitGraphicsChange({ kind: 'preset', choice: 'medium' });
		emitGraphicsChange({ kind: 'auto', on: false });
		emitGraphicsChange({ kind: 'frameCap', choice: '60' });
		off();
		emitGraphicsChange({ kind: 'preset', choice: 'low' });
		expect(seen).toEqual([
			{ kind: 'preset', choice: 'medium' },
			{ kind: 'auto', on: false },
			{ kind: 'frameCap', choice: '60' }
		]);
	});
});
