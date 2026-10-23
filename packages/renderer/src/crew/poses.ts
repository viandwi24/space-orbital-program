/**
 * Poses of the crew character (plan 341, ADR 0291). Since plan 375 (ADR 0313) the motions are
 * registered by plugins as animations by role (`idle`, `walk`, `wave`, `work`, `eva`; stock's are
 * in `mods/stock/src/crew-look.ts`); this file asks the loaded content for the pose of a role.
 * Angles in radians; a positive pitch swings a limb forward (+z), a positive raise lifts an arm
 * out sideways.
 */
import { REST_CREW_POSE, type CrewAnimationRole, type CrewPose } from '@orbital/core';
import { poseFor } from './content.ts';

export type Action = CrewAnimationRole;
export type PersonPose = CrewPose;

/** Length of one step of the short legs, m: a stride is two. */
export const STEP = 0.42;

export const REST_POSE: PersonPose = REST_CREW_POSE;

/**
 * The pose for `action` at time `t` s. `walked` is the distance walked, m (the walk cycle follows it,
 * so feet do not slide); `seed` offsets the idle motions so a group does not move in step.
 */
export function personPose(action: Action, t: number, walked = 0, seed = 0): PersonPose {
	return poseFor(action, t, walked, seed);
}
