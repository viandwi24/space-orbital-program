import { FramePacer } from '@orbital/renderer';
import { describe, expect, it } from 'vitest';
import { HUD_FRAME_HZ } from './hud-rate';

/** The frames of `seconds` at `hz`, with a little timer jitter. */
function due(hz: number, seconds: number): number {
	const pacer = new FramePacer();
	pacer.setCap(HUD_FRAME_HZ);
	let n = 0;
	for (let i = 0; i < hz * seconds; i++) {
		const jitter = ((i * 7919) % 13) / 13 - 0.5; // within ±0.5 ms
		if (pacer.due((i * 1000) / hz + jitter)) n++;
	}
	return n;
}

describe('the HUD repaint rate (plan 396)', () => {
	it('repaints about 60 times a second when the display runs at 120 Hz', () => {
		const n = due(120, 10);
		expect(n).toBeGreaterThan(590);
		expect(n).toBeLessThanOrEqual(600);
	});
	it('repaints every frame at 60 Hz and below', () => {
		expect(due(60, 5)).toBe(300);
		expect(due(30, 5)).toBe(150);
	});
	it('stays within 30 to 60 repaints a second at 144 Hz', () => {
		const n = due(144, 10);
		expect(n).toBeGreaterThan(300);
		expect(n).toBeLessThanOrEqual(600);
	});
});
