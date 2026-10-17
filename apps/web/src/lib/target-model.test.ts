import {
	bodyId,
	entityId,
	type BodyDefinition,
	type Snapshot,
	type VesselSnapshot
} from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { nextTarget, targetChoices, targetCommand, targetHud, targetKey } from './target-model';

const body = (id: string): BodyDefinition => ({ id, mass: 1, radius: 1, rotationPeriod: 1 });
const vessel = (id: number, name?: string, extra: Partial<VesselSnapshot> = {}): VesselSnapshot =>
	({
		id: entityId(id),
		...(name === undefined ? {} : { name }),
		mode: 'on-rails',
		soi: bodyId('stock.home'),
		position: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: { x: 0, y: 0, z: 0, w: 1 },
		parts: [],
		...extra
	}) as VesselSnapshot;
const snapshot = (vessels: VesselSnapshot[]): Snapshot => ({ t: 100, vessels, bodies: [] });

describe('target choices', () => {
	const choices = targetChoices(
		snapshot([vessel(1, 'Rocket'), vessel(2, 'Rocket (debris)'), vessel(3)]),
		1,
		[body('stock.home'), body('stock.cinder')]
	);

	it('lists every body, then the other vessels by name, never the vessel itself', () => {
		expect(choices.map((c) => [c.key, c.label])).toEqual([
			['body:stock.home', 'Home'],
			['body:stock.cinder', 'Cinder'],
			['vessel:2', 'Rocket (debris)'],
			['vessel:3', 'Vessel 3']
		]);
	});

	it('cycles through the list, then to no target, then back to the first', () => {
		let current = nextTarget(choices, undefined);
		const seen: string[] = [];
		for (let i = 0; i < 6 && current; i++) {
			seen.push(targetKey(current));
			current = nextTarget(choices, current);
		}
		expect(seen).toEqual(['body:stock.home', 'body:stock.cinder', 'vessel:2', 'vessel:3']);
		expect(current).toBeNull();
		expect(nextTarget([], undefined)).toBeNull();
		// a target that left the list starts the cycle over from "none"
		expect(nextTarget(choices, { kind: 'vessel', id: entityId(9) })).toBeNull();
	});

	it('builds the command the sim validates', () => {
		expect(targetCommand(entityId(1), choices[1]!.ref)).toEqual({
			type: 'target-set',
			vessel: 1,
			target: { kind: 'body', id: 'stock.cinder' }
		});
		expect(targetCommand(1, null)).toEqual({ type: 'target-set', vessel: 1, target: null });
	});
});

describe('the target card', () => {
	const aimed = (
		position: { x: number; y: number; z: number },
		velocity: { x: number; y: number; z: number },
		sas?: VesselSnapshot['sas']
	) =>
		vessel(1, 'Rocket', {
			...(sas ? { sas } : {}),
			target: {
				kind: 'vessel',
				id: entityId(2),
				name: 'Probe',
				position,
				velocity,
				distance: Math.hypot(position.x, position.y, position.z),
				relativeSpeed: Math.hypot(velocity.x, velocity.y, velocity.z),
				approach: { time: 160, distance: 800, relativeSpeed: 5 }
			}
		});

	it('is null without a target', () => {
		expect(targetHud(vessel(1, 'Rocket'), 100)).toBeNull();
	});

	it('closing is positive when the distance shrinks and negative when it grows', () => {
		const closing = targetHud(aimed({ x: 1000, y: 0, z: 0 }, { x: -30, y: 0, z: 40 }), 100)!;
		expect(closing.closing).toBeCloseTo(30, 9);
		expect(closing.relativeSpeed).toBe(50);
		expect(closing.distance).toBe(1000);
		const opening = targetHud(aimed({ x: 0, y: 500, z: 0 }, { x: 0, y: 12, z: 0 }), 100)!;
		expect(opening.closing).toBeCloseTo(-12, 9);
		expect(targetHud(aimed({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 100)!.closing).toBe(0);
	});

	it('reports the approach as a time from now and what SAS is doing', () => {
		const hud = targetHud(
			aimed(
				{ x: 10, y: 0, z: 0 },
				{ x: 0, y: 0, z: 0 },
				{ mode: 'anti-target', reference: 'surface', error: 0 }
			),
			100
		)!;
		expect(hud.approach).toEqual({ in: 60, distance: 800, relativeSpeed: 5 });
		expect(hud.pointing).toBe('anti-target');
		expect(hud.name).toBe('Probe');
		expect(targetHud(aimed({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), 200)!.approach!.in).toBe(
			0
		);
	});

	it('names a body by its label', () => {
		const v = vessel(1, 'Rocket', {
			target: {
				kind: 'body',
				id: bodyId('stock.cinder'),
				name: 'stock.cinder',
				position: { x: 1, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
				distance: 1,
				relativeSpeed: 0,
				approach: null
			}
		});
		const hud = targetHud(v, 0)!;
		expect(hud.name).toBe('Cinder');
		expect(hud.approach).toBeNull();
		expect(hud.pointing).toBeNull();
	});
});
