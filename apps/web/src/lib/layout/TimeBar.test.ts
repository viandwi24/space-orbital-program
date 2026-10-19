/**
 * The time bar (plan 233, BASE_LAYOUT §2), with the earlier time control's checks: the game date
 * (plan 081, ADR 0141) in the time's tooltip, catch up (plan 087) and the warp limits (plan 206).
 */
import { calendarOf, epochFromUtc, formatDate, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { createHudController } from '../hud-controller';
import { WARP_STEPS } from '../warp';
import TimeBar from './TimeBar.svelte';

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: ['stock.command-pod', 'stock.tank-small'].map((p, index) => ({
		index,
		part: partId(p),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
};

const base = { t: 0, paused: false, steps: WARP_STEPS, index: 0, time: 'T+ 00:00' };
const bar = (props: Partial<Parameters<typeof TimeBar>[1]> = {}): string =>
	render(TimeBar, { props: { ...base, ...props } }).body;
const warp = (date: string): string => bar({ date });

describe('time control date', () => {
	it('the HUD model formats the snapshot time in the world calendar, and the warp control shows it', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			seed: 1
		});
		try {
			const r = sim.dispatch({
				type: 'load-vessel',
				design: probe,
				placement: {
					kind: 'state',
					position: { x: 750_000, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -2_170 }
				}
			});
			if (!r.ok) throw new Error(r.reason);
			const bodies = sim.registries.bodies.list();
			const epoch = { day: 2, fraction: 0.25 };
			const hud = createHudController({
				design: probe,
				content: sim.registries,
				bodies,
				epoch,
				project: () => null,
				now: () => 0,
				rendezvous: () => ({ approach: null, aids: [] })
			});
			hud.attach(Number(r.vessel));
			sim.step(0.5);
			const snap = sim.snapshot();
			hud.snapshot(snap);
			const model = hud.model(0, 0)!;
			const expected = formatDate(calendarOf(bodies), epoch, snap.t).text;
			// stock: fictional solar days of 21 650.8 s (plan 122); 2.25 SI days is day 9 at about 05:53
			expect(expected.startsWith('Year 1, day 9, 05:53')).toBe(true);
			expect(model.date).toBe(expected);
			expect(warp(model.date)).toContain(`title="${expected}"`);
		} finally {
			sim.dispose();
		}
	});

	it('shows a Gregorian date for a real-calendar world, and nothing before the first model', () => {
		const epoch = epochFromUtc({ year: 2026, month: 10, day: 17, hour: 6, minute: 0, second: 0 });
		const text = formatDate({ kind: 'gregorian-utc' }, epoch, 90).text;
		expect(text).toBe('2026-10-17 06:01:30.000 UTC');
		expect(warp(text)).toContain(text);
		expect(warp('')).not.toContain('UTC');
	});

	it('offers "Catch up to now" when behind the real date, and says why when it cannot', () => {
		const offer = bar({
			catchUp: {
				kind: 'offer',
				time: 3_456_000,
				behindSeconds: 3_456_000,
				date: '2026-10-17 12:00:00.000 UTC'
			}
		});
		expect(offer).toMatch(/<button[^>]*data-testid="catch-up"[^>]*>Catch up to now<\/button>/);
		expect(offer).not.toMatch(/data-testid="catch-up"[^>]*disabled/);
		expect(offer).toContain('40 days behind the real date');
		const flying = bar({
			catchUp: {
				kind: 'unavailable',
				behindSeconds: 3_456_000,
				reason: '"Lander" is in flight; time warp needs every vessel on rails.'
			}
		});
		expect(flying).toMatch(/data-testid="catch-up"[^>]*disabled/);
		expect(flying).toContain('Catch up is unavailable: "Lander" is in flight');
		expect(bar()).not.toContain('catch-up');
	});
});

describe('warp limits in the time bar (plan 206)', () => {
	it('shows the reason text next to the clamped segment, and the levels above it out of reach', () => {
		const body = bar({ index: 3, limit: 10, reason: 'Max 10× — engine running', onpick: () => {} });
		expect(body).toContain('data-testid="warp-reason"');
		expect(body).toContain('Max 10× — engine running');
		// 8 levels: 1, 2, 4 and 10 reachable, the four rails levels out of reach
		expect(body.match(/class="seg[ "]/g)?.length).toBe(8);
		expect(body.match(/class="seg [^"]*\blocked\b/g)?.length).toBe(4);
		expect(body).toContain('data-testid="hud-warp">10×<');
		// paused: every segment dim, the multiple reads —
		const paused = bar({ index: 3, paused: true });
		expect(paused).toContain('data-testid="hud-warp">—<');
		expect(paused.match(/class="seg off/g)?.length).toBe(8);
	});

	it('shows no reason at the top level, and nine levels in a Sol world', () => {
		const body = bar({ steps: [1, 2, 4, 10, 50, 100, 1_000, 10_000, 100_000], limit: 100_000 });
		expect(body).not.toContain('warp-reason');
		expect(body.match(/class="seg[ "]/g)?.length).toBe(9);
	});
});
