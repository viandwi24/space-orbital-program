/** Tooltips (plan 228): the hover delay, focus, Escape, the grace for the glossary link, placement. */
import { describe, expect, it } from 'vitest';
import {
	HIDE_GRACE_MS,
	LONG_PRESS_MS,
	TIP_DELAY_MS,
	TIP_IDLE,
	TIP_MARGIN,
	placeTip,
	tipReducer,
	type TipEvent,
	type TipState
} from './tooltip';

const run = (events: TipEvent[], from: TipState = TIP_IDLE): TipState =>
	events.reduce(tipReducer, from);

describe('tooltip timing', () => {
	it('shows on hover only after the delay', () => {
		const s = run([{ type: 'hover', id: 'ap', now: 0 }]);
		expect(run([{ type: 'tick', now: TIP_DELAY_MS - 1 }], s).open).toBeNull();
		expect(run([{ type: 'tick', now: TIP_DELAY_MS }], s).open).toBe('ap');
	});

	it('shows at once on keyboard focus', () => {
		expect(run([{ type: 'focus', id: 'ap' }]).open).toBe('ap');
	});

	it('a pointer that leaves before the delay shows nothing', () => {
		const s = run([
			{ type: 'hover', id: 'ap', now: 0 },
			{ type: 'leave', id: 'ap', now: 100 },
			{ type: 'tick', now: 1000 }
		]);
		expect(s.open).toBeNull();
	});

	it('Escape closes it', () => {
		expect(run([{ type: 'focus', id: 'ap' }, { type: 'escape' }]).open).toBeNull();
	});

	it('stays open while the pointer is in the tooltip (its glossary link), then closes', () => {
		let s = run([
			{ type: 'focus', id: 'ap' },
			{ type: 'leave', id: 'ap', now: 1000 }
		]);
		s = run([{ type: 'enter-tip' }, { type: 'tick', now: 1000 + HIDE_GRACE_MS + 50 }], s);
		expect(s.open).toBe('ap');
		s = run(
			[
				{ type: 'leave-tip', now: 2000 },
				{ type: 'tick', now: 2000 + HIDE_GRACE_MS }
			],
			s
		);
		expect(s.open).toBeNull();
	});

	it('a touch long-press shows it; a short tap does not', () => {
		const press = run([{ type: 'press', id: 'ap', now: 0 }]);
		expect(run([{ type: 'tick', now: LONG_PRESS_MS }], press).open).toBe('ap');
		expect(run([{ type: 'release' }, { type: 'tick', now: LONG_PRESS_MS }], press).open).toBeNull();
	});
});

describe('tooltip placement in a 1024 × 768 viewport', () => {
	const viewport = { width: 1024, height: 768 };
	const size = { width: 220, height: 60 };
	const inside = (p: { x: number; y: number }) =>
		p.x >= TIP_MARGIN &&
		p.y >= TIP_MARGIN &&
		p.x + size.width <= viewport.width - TIP_MARGIN &&
		p.y + size.height <= viewport.height - TIP_MARGIN;

	it('goes above its element when there is room', () => {
		const p = placeTip({ x: 400, y: 400, width: 60, height: 20 }, size, viewport);
		expect(p.side).toBe('above');
		expect(p.y + size.height).toBeLessThanOrEqual(400);
		expect(inside(p)).toBe(true);
	});

	it('stays inside the viewport at every corner', () => {
		for (const [x, y] of [
			[0, 0],
			[1000, 0],
			[0, 750],
			[1000, 750]
		] as const) {
			const p = placeTip({ x, y, width: 24, height: 18 }, size, viewport);
			expect(inside(p), `${x},${y}`).toBe(true);
		}
	});

	it('does not cover the navball when a side keeps it clear', () => {
		const navball = { x: 412, y: 560, width: 200, height: 200 };
		// a read-out just above the navball: "above" is clear, "below" would cover it
		const p = placeTip({ x: 480, y: 540, width: 60, height: 16 }, size, viewport, [navball]);
		const box = { x: p.x, y: p.y, ...size };
		const hit =
			box.x < navball.x + navball.width &&
			navball.x < box.x + box.width &&
			box.y < navball.y + navball.height &&
			navball.y < box.y + box.height;
		expect(hit).toBe(false);
	});
});
