import { describe, expect, it } from 'vitest';
import {
	addToast,
	MAX_TOASTS,
	pruneToasts,
	toastForHeat,
	toastForPhase,
	toastForRefusal,
	toastForSimEvent,
	type ToastContext
} from './toasts';

const ctx: ToastContext = {
	isActivePart: (p) => p === 7,
	isActiveVessel: (v) => v === 1,
	partTitle: (d) => (d === 'stock.engine-lv' ? 'LV-T30 Liquid Engine' : d),
	definitionOf: (p) => (p === 7 ? 'stock.engine-lv' : undefined)
};

describe('toasts from sim events', () => {
	it('a change of sphere of influence is announced for the flown vessel only', () => {
		expect(
			toastForSimEvent(
				{ type: 'soi-changed', vessel: 1, from: 'stock.home', to: 'stock.cinder' },
				ctx
			)
		).toMatchObject({ kind: 'info', title: 'Entering the sphere of Cinder', key: 'soi' });
		expect(
			toastForSimEvent(
				{ type: 'soi-changed', vessel: 2, from: 'stock.home', to: 'stock.cinder' },
				ctx
			)
		).toBeNull();
	});
	it('stage fired is 1-based and only for the flown vessel', () => {
		expect(toastForSimEvent({ type: 'stage', vessel: 1, stage: 0 }, ctx)).toMatchObject({
			kind: 'info',
			title: 'Stage 1 fired'
		});
		expect(toastForSimEvent({ type: 'stage', vessel: 2, stage: 0 }, ctx)).toBeNull();
	});
	it('flameout names the engine, ignores other vessels', () => {
		expect(toastForSimEvent({ type: 'flameout', part: 7 }, ctx)).toMatchObject({
			kind: 'warning',
			title: 'Engine flameout',
			detail: 'LV-T30 Liquid Engine ran out of propellant'
		});
		expect(toastForSimEvent({ type: 'flameout', part: 99 }, ctx)).toBeNull();
	});
	it('impact: broken is a warning, destroyed a danger; overheat is a danger with the temperature', () => {
		const base = {
			type: 'part-damaged',
			vessel: 1,
			part: 3,
			definition: 'stock.engine-lv',
			speed: 12
		} as const;
		expect(toastForSimEvent({ ...base, outcome: 'broken' }, ctx)).toMatchObject({
			kind: 'warning',
			title: 'LV-T30 Liquid Engine broke off',
			detail: 'Hit the ground at 12.0 m/s'
		});
		expect(toastForSimEvent({ ...base, outcome: 'destroyed', cause: 'impact' }, ctx)?.kind).toBe(
			'danger'
		);
		expect(
			toastForSimEvent(
				{ ...base, outcome: 'destroyed', cause: 'overheat', temperature: 1820.4 },
				ctx
			)
		).toMatchObject({
			kind: 'danger',
			title: 'LV-T30 Liquid Engine burned up',
			detail: 'Skin reached 1820 K'
		});
		expect(toastForSimEvent({ ...base, vessel: 5, outcome: 'broken' }, ctx)).toBeNull();
	});
	it('mode change: rails announces time warp, flight stays quiet; loss is a danger', () => {
		expect(
			toastForSimEvent({ type: 'mode-changed', vessel: 1, mode: 'on-rails', reason: 'x' }, ctx)
		).toMatchObject({ title: 'On rails', detail: 'Time warp is available' });
		expect(
			toastForSimEvent({ type: 'mode-changed', vessel: 1, mode: 'flight', reason: 'x' }, ctx)
		).toBeNull();
		expect(
			toastForSimEvent(
				{ type: 'mode-changed', vessel: 1, mode: 'on-rails', reason: 'at rest on the ground' },
				ctx
			)
		).toBeNull();
		expect(
			toastForSimEvent({ type: 'vessel-destroyed', vessel: 1, reason: 'crashed' }, ctx)
		).toMatchObject({
			kind: 'danger',
			detail: 'crashed'
		});
	});
});

describe('toasts from HUD transitions and refusals', () => {
	it('liftoff, orbit and landing; nothing on the first reading or when unchanged', () => {
		expect(toastForPhase(null, 'landed')).toBeNull();
		expect(toastForPhase('landed', 'landed')).toBeNull();
		expect(toastForPhase('landed', 'flight')?.title).toBe('Liftoff');
		expect(toastForPhase('flight', 'orbit', { apoapsis: 80_000, periapsis: 76_000 })).toMatchObject(
			{
				title: 'Stable orbit',
				detail: 'Pe 76.0 km, Ap 80.0 km'
			}
		);
		expect(toastForPhase('suborbital', 'landed')?.title).toBe('Landed');
	});
	it('refusals name the command and reason', () => {
		expect(toastForRefusal('warp', 'time warp needs every vessel on rails')).toMatchObject({
			kind: 'warning',
			title: 'Cannot warp',
			detail: 'time warp needs every vessel on rails'
		});
	});
	it('heat warns once at 85 % and re-arms below 70 %', () => {
		let r = toastForHeat(0.5, true);
		expect(r.toast).toBeNull();
		r = toastForHeat(0.9, r.armed);
		expect(r.toast?.title).toBe('Overheating');
		r = toastForHeat(0.95, r.armed);
		expect(r.toast).toBeNull();
		r = toastForHeat(0.6, r.armed);
		expect(r.armed).toBe(true);
	});
});

describe('toast store', () => {
	it('replaces same-key toasts, keeps the newest four, expires by time', () => {
		let list = addToast([], { kind: 'info', title: 'a', key: 'k' }, 0, 1);
		list = addToast(list, { kind: 'info', title: 'b', key: 'k' }, 10, 2);
		expect(list.map((t) => t.title)).toEqual(['b']);
		for (let i = 0; i < 6; i++) list = addToast(list, { kind: 'info', title: `n${i}` }, 20, 3 + i);
		expect(list).toHaveLength(MAX_TOASTS);
		expect(list.at(-1)!.title).toBe('n5');
		expect(pruneToasts(list, 20 + 4_001)).toEqual([]);
		expect(pruneToasts(list, 21)).toBe(list);
	});
});
