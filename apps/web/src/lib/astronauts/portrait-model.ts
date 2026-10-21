/**
 * Which portrait a crew member gets (plan 341, ADR 0291 point 5): their look from their id; the
 * flight suit while aboard a vessel, their profession's outfit at the Space Center; happy, sad when
 * lost or missing, sleepy on a long warp.
 */
import {
	appearanceOf,
	outfitForProfession,
	type CharacterSpec,
	type Expression
} from '@orbital/renderer/crew';

export interface PortraitMember {
	id: string;
	profession: string;
	status?: string;
	/** True during a long time warp: the crew dozes. */
	warping?: boolean;
}

export function portraitExpression(m: PortraitMember): Expression {
	if (m.status === 'lost' || m.status === 'missing') return 'sad';
	if (m.warping && m.status === 'assigned') return 'sleepy';
	return 'happy';
}

export function portraitSpec(m: PortraitMember): CharacterSpec {
	return {
		outfit: m.status === 'assigned' ? 'flight' : outfitForProfession(m.profession),
		appearance: appearanceOf(m.id),
		expression: portraitExpression(m)
	};
}
