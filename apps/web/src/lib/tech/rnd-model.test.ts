import { describe, expect, it } from 'vitest';
import type { TechNodeDefinition } from '@orbital/core';
import { techColumns } from './rnd-model';

const nodes: TechNodeDefinition[] = [
	{ id: 't.basics', label: 'Basics', tier: 0, cost: 0, unlocks: ['p.pod'] },
	{ id: 't.instr', label: 'Instruments', tier: 1, cost: 10, requires: ['t.basics'] },
	{ id: 't.prop', label: 'Propulsion', tier: 2, cost: 25, requires: ['t.instr'] },
	{ id: 't.orb', label: 'Orbital', tier: 2, cost: 5, milestone: 'orbit:home' }
];
const title = (id: string) => (id === 'p.pod' ? 'Pod' : id);

describe('the R&D columns (plan 105)', () => {
	it('groups by tier and names each node state with the reason', () => {
		const cols = techColumns(
			nodes,
			{ tech: { enabled: true, researched: [] }, milestones: [], economy: undefined },
			title
		);
		expect(cols.map((c) => c.tier)).toEqual([0, 1, 2]);
		const [basics] = cols[0]!.nodes;
		expect(basics).toMatchObject({ state: 'unlocked', unlocks: ['Pod'] });
		expect(cols[1]!.nodes[0]).toMatchObject({
			state: 'locked',
			reason: 'needs 10 science, the world has 0'
		});
		const prop = cols[2]!.nodes.find((n) => n.id === 't.prop')!;
		expect(prop.reason).toBe('research "Instruments" first');
		expect(cols[2]!.nodes.find((n) => n.id === 't.orb')!.reason).toBe(
			'needs the milestone "orbit:home"'
		);
	});

	it('a node with its science and milestone met can be researched', () => {
		const snap = {
			tech: { enabled: true, researched: ['t.instr'] },
			milestones: [{ id: 'orbit:home' }],
			economy: { science: 30 }
		} as never;
		const cols = techColumns(nodes, snap, title);
		expect(cols[1]!.nodes[0]!.state).toBe('unlocked');
		expect(cols[2]!.nodes.every((n) => n.state === 'available')).toBe(true);
	});
});
