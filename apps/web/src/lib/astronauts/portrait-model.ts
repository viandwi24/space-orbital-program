/**
 * Which portrait a crew member gets (plan 341, ADR 0291 point 5): their look from their id; the
 * flight suit while aboard a vessel, their profession's outfit at the Space Center; happy, sad when
 * lost or missing, sleepy on a long warp. The outfits and faces are the plugins' (ADR 0313): the
 * one registered for pods, the one for the profession, the face registered for the mood.
 */
import type { CrewMood } from '@orbital/core';
import {
	appearanceOf,
	outfitFor,
	outfitForProfession,
	type CharacterSpec
} from '@orbital/renderer/crew';

export interface PortraitMember {
	id: string;
	profession: string;
	status?: string;
	/** True during a long time warp: the crew dozes. */
	warping?: boolean;
}

export function portraitExpression(m: PortraitMember): CrewMood {
	if (m.status === 'lost' || m.status === 'missing') return 'sad';
	if (m.warping && m.status === 'assigned') return 'sleepy';
	return 'happy';
}

export function portraitSpec(m: PortraitMember): CharacterSpec {
	return {
		outfit: m.status === 'assigned' ? outfitFor('pod').id : outfitForProfession(m.profession).id,
		appearance: appearanceOf(m.id),
		expression: portraitExpression(m)
	};
}
