/** What the lesson bake builds (plan 379, ADR 0355): the lessons' vessels and the stock system's facts. */
import type { BodyDefinition, VesselDesign } from '@orbital/core';
import type { Content } from '../editor/state';
import { stableNumbers } from '../editor/blueprint-sources';
import { systemFacts } from '../worlds/system-facts';
import {
	arm,
	beacon,
	chaser,
	lander,
	pathfinder,
	pathfinderCapsule,
	relayProbe,
	relaySatellite,
	skylark,
	spentStage,
	moonBase
} from './lesson-vessels';

const BUILDERS = {
	skylark,
	pathfinderCapsule,
	pathfinder,
	lander,
	chaser,
	beacon,
	relayProbe,
	relaySatellite,
	arm,
	spentStage,
	moonBase
};

/** Every lesson vessel built against `content`. */
export function bakeLessonDesigns(content: Content): Record<keyof typeof BUILDERS, VesselDesign> {
	return Object.fromEntries(
		Object.entries(BUILDERS).map(([name, build]) => [name, stableNumbers(build(content))])
	) as Record<keyof typeof BUILDERS, VesselDesign>;
}

/** The numbers the lesson texts quote, from the stock bodies. */
export function lessonFacts(bodies: readonly BodyDefinition[]): {
	lowOrbit: number;
	dvToOrbit: number;
} {
	const facts = systemFacts(bodies)!;
	return { lowOrbit: facts.lowOrbit, dvToOrbit: facts.dvToOrbit };
}
