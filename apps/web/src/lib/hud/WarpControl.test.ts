/** The game date in the time control (plan 081, ADR 0141): model at a snapshot time, then the markup. */
import { calendarOf, epochFromUtc, formatDate, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { createHudController } from '../hud-controller';
import WarpControl from './WarpControl.svelte';

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

const warp = (date: string, met: number): string =>
	render(WarpControl, {
		props: { warp: 1, usable: true, met, date, onslower: () => {}, onfaster: () => {} }
	}).body;

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
			// stock: fictional days of 6 h; 2.25 days of 86 400 s after day 1 = day 10, then t
			expect(expected.startsWith('Day 10, 00:')).toBe(true);
			expect(model.date).toBe(expected);
			expect(warp(model.date, model.met)).toContain(`data-testid="hud-date">${expected}<`);
		} finally {
			sim.dispose();
		}
	});

	it('shows a Gregorian date for a real-calendar world, and nothing before the first model', () => {
		const epoch = epochFromUtc({ year: 2026, month: 10, day: 17, hour: 6, minute: 0, second: 0 });
		const text = formatDate({ kind: 'gregorian-utc' }, epoch, 90).text;
		expect(text).toBe('2026-10-17 06:01:30.000 UTC');
		expect(warp(text, 90)).toContain(text);
		expect(warp('', 0)).not.toContain('hud-date');
	});

	it('offers "Catch up to now" when behind the real date, and says why when it cannot', () => {
		const props = {
			warp: 1,
			usable: true,
			met: 0,
			date: '',
			onslower: () => {},
			onfaster: () => {}
		};
		const offer = render(WarpControl, {
			props: {
				...props,
				catchUp: {
					kind: 'offer',
					time: 3_456_000,
					behindSeconds: 3_456_000,
					date: '2026-10-17 12:00:00.000 UTC'
				}
			}
		}).body;
		expect(offer).toMatch(/<button[^>]*data-testid="catch-up"[^>]*>Catch up to now<\/button>/);
		expect(offer).not.toMatch(/data-testid="catch-up"[^>]*disabled/);
		expect(offer).toContain('40 days behind the real date');
		const flying = render(WarpControl, {
			props: {
				...props,
				catchUp: {
					kind: 'unavailable',
					behindSeconds: 3_456_000,
					reason: '"Lander" is in flight; time warp needs every vessel on rails.'
				}
			}
		}).body;
		expect(flying).toMatch(/data-testid="catch-up"[^>]*disabled/);
		expect(flying).toContain('Catch up is unavailable: "Lander" is in flight');
		expect(render(WarpControl, { props }).body).not.toContain('catch-up');
	});
});
