import { describe, expect, test } from 'vitest';
import type { Snapshot } from '@orbital/core';
import { stackAt, stackEntries, STACK_RADIUS } from './map-stack';

describe('stackAt (plan 270)', () => {
	const points = [
		{ key: 'vessel:1', x: 100, y: 100 },
		{ key: 'vessel:2', x: 104, y: 103 },
		{ key: 'vessel:3', x: 100 + STACK_RADIUS + 1, y: 100 },
		{ key: 'body:stock.home', x: 101, y: 100 },
		{ key: 'vessel:4', x: 99, y: 100 }
	];

	test('lists every vessel icon within the radius, nearest first; bodies are not vessels', () => {
		expect(stackAt(points, 100, 100)).toEqual(['vessel:1', 'vessel:4', 'vessel:2']);
	});

	test('a lone icon is a stack of one; an empty spot is none', () => {
		expect(stackAt(points, 120, 100)).toEqual(['vessel:3']);
		expect(stackAt(points, 300, 300)).toEqual([]);
	});

	test('a key seen twice counts once, at its nearest point; ties go by key', () => {
		const twice = [
			{ key: 'vessel:9', x: 0, y: 0 },
			{ key: 'vessel:9', x: 5, y: 0 },
			{ key: 'vessel:8', x: 0, y: 0 }
		];
		expect(stackAt(twice, 0, 0)).toEqual(['vessel:8', 'vessel:9']);
	});
});

describe('stackEntries (plan 270)', () => {
	const snapshot = {
		vessels: [
			{
				id: 1,
				name: 'Moon shot',
				type: 'ship',
				soi: 'stock.home',
				position: { x: 700_000, y: 0, z: 0 }
			},
			{
				id: 2,
				name: 'Moon shot debris',
				type: 'debris',
				soi: 'stock.home',
				position: { x: 0, y: 680_000, z: 0 }
			},
			{
				id: 3,
				name: 'Relay',
				type: 'relay',
				soi: 'stock.home',
				position: { x: 0, y: 0, z: 900_000 }
			},
			{
				id: 4,
				name: 'Rover',
				type: 'rover',
				soi: 'stock.home',
				surface: true,
				position: { x: 600_000, y: 0, z: 0 }
			}
		]
	} as unknown as Snapshot;
	const bodies = [{ id: 'stock.home', radius: 600_000 }] as never;

	test('each entry has the name, the type for its icon, the role and the altitude', () => {
		const out = stackEntries(
			['vessel:2', 'vessel:1', 'vessel:3', 'vessel:4', 'vessel:5'],
			snapshot,
			{
				bodies,
				active: 1,
				target: 'vessel:3'
			}
		);
		expect(out.map((e) => [e.key, e.name, e.type, e.role])).toEqual([
			['vessel:2', 'Moon shot debris', 'debris', 'Debris'],
			['vessel:1', 'Moon shot', 'ship', 'Active'],
			['vessel:3', 'Relay', 'relay', 'Target'],
			['vessel:4', 'Rover', 'rover', 'Rover']
		]);
		expect(out[0]!.hint).toMatch(/80/);
		expect(out[3]!.hint).toBe('Landed');
	});
});
