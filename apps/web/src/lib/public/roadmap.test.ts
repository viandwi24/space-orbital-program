import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPlanStatus } from '../../../plan-status';
import {
	EXPLORING_PLANS,
	ROADMAP,
	ROADMAP_NOTES,
	ROADMAP_PHASES,
	SHIPPED,
	labelOf
} from './roadmap';

const status = readPlanStatus(join(__dirname, '../../../../../docs/plans'));

describe('public roadmap', () => {
	it('lists only plans that exist, with a known status', () => {
		for (const item of [...ROADMAP, ...SHIPPED]) {
			expect(['draft', 'ready', 'in-progress', 'blocked', 'done'], `plan ${item.plan}`).toContain(
				status[item.plan]
			);
		}
	});
	it('lists in SHIPPED only plans that are done', () => {
		for (const item of SHIPPED) expect(status[item.plan], `plan ${item.plan}`).toBe('done');
	});
	it('has unique plans, known phases and a sentence for each', () => {
		const plans = [...ROADMAP, ...SHIPPED].map((r) => r.plan);
		expect(new Set(plans).size).toBe(plans.length);
		for (const item of ROADMAP) {
			expect(ROADMAP_PHASES).toContain(item.phase);
			expect(item.gives.length).toBeGreaterThan(40);
		}
		for (const phase of ROADMAP_PHASES)
			expect(
				ROADMAP.some((r) => r.phase === phase),
				phase
			).toBe(true);
	});
	it('marks exactly the items ADR 0108 names as exploring', () => {
		const exploring = ROADMAP.filter((r) => r.exploring).map((r) => r.plan);
		expect(new Set(exploring)).toEqual(new Set(EXPLORING_PLANS));
	});
	it('keeps the earlier drafts (ADR 0048 post-v1 list and its follow-ups)', () => {
		for (const id of ['063', '065', '066', '067', '069', '070', '073'])
			expect(ROADMAP.map((r) => r.plan)).toContain(id);
	});
	it('labels from the plan status: done is shipped, in-progress is in progress', () => {
		expect(labelOf({ plan: '1' }, 'done')).toBe('shipped');
		expect(labelOf({ plan: '1' }, 'in-progress')).toBe('in progress');
		expect(labelOf({ plan: '1' }, 'draft')).toBe('planned');
		expect(labelOf({ plan: '1', exploring: true }, 'draft')).toBe('exploring');
		expect(labelOf({ plan: '1', exploring: true }, 'in-progress')).toBe('in progress');
	});
	it('dates every note', () => {
		for (const n of ROADMAP_NOTES) expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
