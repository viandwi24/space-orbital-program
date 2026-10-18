/**
 * The planning Worker's messages (plan 118, ADR 0163 point 1): one request kind per tool, and
 * `answer`, the pure dispatcher the Worker runs (tests call it directly).
 */
import { resonantDeployment, type DeploymentInput, type DeploymentPlan } from '@orbital/kepler';
import { coverageGrid, type CoverageGrid, type CoverageInput } from './coverage';
import type { PlanNode, PlanWorld } from './geometry';
import { contactTimeline, type ContactTimeline } from './timeline';

export type PlanRequest =
	| { kind: 'timeline'; world: PlanWorld; a: PlanNode; b: PlanNode; from: number; horizon: number }
	| { kind: 'coverage'; world: PlanWorld; input: CoverageInput }
	| { kind: 'constellation'; input: DeploymentInput };

export interface PlanResults {
	timeline: ContactTimeline;
	coverage: CoverageGrid;
	constellation: DeploymentPlan;
}

export type PlanResult = PlanResults[keyof PlanResults];

export interface PlanMessage {
	id: number;
	request: PlanRequest;
}

export type PlanReply =
	{ id: number; ok: true; result: PlanResult } | { id: number; ok: false; error: string };

export function answer(request: PlanRequest): PlanResult {
	switch (request.kind) {
		case 'timeline':
			return contactTimeline(request.world, request.a, request.b, request.from, request.horizon);
		case 'coverage':
			return coverageGrid(request.world, request.input);
		case 'constellation':
			return resonantDeployment(request.input);
	}
}
