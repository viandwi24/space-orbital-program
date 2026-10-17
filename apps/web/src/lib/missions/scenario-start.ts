/**
 * The first flight of a world made from a scenario (plan 100, ADR 0151 point 4): the vessel the
 * player flies, where it starts, the other vessels, and the missions to start.
 */
import {
	scenarioPlacement,
	type ScenarioDefinition,
	type VesselDesign,
	type VesselPlacement
} from '@orbital/core';

export interface ScenarioStart {
	design: VesselDesign;
	placement: VesselPlacement;
	others: { design: VesselDesign; placement: VesselPlacement }[];
	missions: string[];
}

export function scenarioStart(
	scenario: ScenarioDefinition,
	bodies: { get(id: string): { radius: number; mass: number } | undefined },
	site = 'legacy'
): ScenarioStart {
	const [first, ...rest] = scenario.vessels.map((v) => ({
		design: v.name ? { ...v.design, name: v.name } : v.design,
		placement: scenarioPlacement(v, bodies, site)
	}));
	return {
		design: first!.design,
		placement: first!.placement,
		others: rest,
		missions: [...(scenario.missions ?? [])]
	};
}
