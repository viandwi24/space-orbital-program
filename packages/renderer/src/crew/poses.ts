/**
 * Poses of the crew character (plan 341, ADR 0291) as pure functions of time: walk (by the distance
 * walked), idle (breathing, looking about), wave and work (a hand busy at the chest). Angles in
 * radians; a positive pitch swings a limb forward (+z), a positive raise lifts an arm out sideways.
 */

export type Action = 'idle' | 'walk' | 'wave' | 'work';

export interface PersonPose {
	/** Body bob, m, and forward lean, rad. */
	bob: number;
	lean: number;
	headPitch: number;
	headYaw: number;
	headRoll: number;
	armLPitch: number;
	armLRaise: number;
	armRPitch: number;
	armRRaise: number;
	legLPitch: number;
	legRPitch: number;
}

/** Length of one step of the short legs, m: a stride is two. */
export const STEP = 0.42;

export const REST_POSE: PersonPose = {
	bob: 0,
	lean: 0,
	headPitch: 0,
	headYaw: 0,
	headRoll: 0,
	armLPitch: 0,
	armLRaise: 0,
	armRPitch: 0,
	armRRaise: 0,
	legLPitch: 0,
	legRPitch: 0
};

/**
 * The pose for `action` at time `t` s. `walked` is the distance walked, m (the walk cycle follows it,
 * so feet do not slide); `seed` offsets the idle motions so a group does not move in step.
 */
export function personPose(action: Action, t: number, walked = 0, seed = 0): PersonPose {
	const breathe = Math.sin(t * 1.7 + seed) * 0.004;
	const look = Math.sin(t * 0.37 + seed * 1.3) * 0.3 + Math.sin(t * 0.11 + seed) * 0.15;
	switch (action) {
		case 'walk': {
			const phase = (walked / STEP) * Math.PI;
			const s = Math.sin(phase);
			return {
				bob: Math.abs(Math.cos(phase)) * 0.022,
				lean: 0.06,
				headPitch: -0.03,
				headYaw: Math.sin(phase * 0.5) * 0.05,
				headRoll: s * 0.04,
				armLPitch: -s * 0.5,
				armLRaise: 0.06,
				armRPitch: s * 0.5,
				armRRaise: 0.06,
				legLPitch: s * 0.55,
				legRPitch: -s * 0.55
			};
		}
		case 'wave':
			return {
				...REST_POSE,
				bob: breathe,
				headRoll: 0.12,
				headYaw: 0.1,
				armRRaise: 2.5 + Math.sin(t * 7 + seed) * 0.32,
				armRPitch: 0.2,
				armLRaise: 0.08
			};
		case 'work':
			return {
				...REST_POSE,
				bob: breathe,
				headPitch: 0.28 + Math.sin(t * 0.5 + seed) * 0.05,
				headYaw: Math.sin(t * 0.3 + seed) * 0.12,
				armRPitch: 0.85 + Math.sin(t * 3.1 + seed) * 0.06,
				armRRaise: -0.15,
				armLPitch: 0.6 + Math.sin(t * 2.3 + seed) * 0.08,
				armLRaise: -0.2
			};
		case 'idle':
			return {
				...REST_POSE,
				bob: breathe,
				headYaw: look,
				headPitch: Math.sin(t * 0.23 + seed) * 0.06,
				armLRaise: 0.07 + breathe * 3,
				armRRaise: 0.07 + breathe * 3,
				armLPitch: Math.sin(t * 0.9 + seed) * 0.04,
				armRPitch: -Math.sin(t * 0.9 + seed) * 0.04
			};
	}
}
