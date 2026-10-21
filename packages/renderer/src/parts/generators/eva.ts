/**
 * EVA figures (plan 109, ADR 0120 point 7; plan 341, ADR 0291): the crew character in the EVA
 * outfit (white suit, life-support pack, an open helmet so the face shows) and a planted flag
 * (pole, cloth, foot). The figure stands on the bottom of the part's box at true scale.
 */
import { addCharacterToPart } from '../../crew/person.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import { canopyDynamic } from './parachute.ts';

/** The suit's canopy: a personal chute, a dome of 4 m radius (plan 249). */
const SUIT_CANOPY = 4;

export function suit(ctx: GenContext): GeneratedPart {
	const { builder: b, moving: m, size } = ctx;
	// the stock suit's box is 1.8 m: the figure is `CREW_HEIGHT` tall in it; another box scales it
	const k = size[1] / 1.8;
	// the helmet is the moving piece: the `visible` articulation hides it while it is off (plan 249)
	const pivot = addCharacterToPart(b, m, { outfit: 'eva' }, k, -size[1] / 2);
	return { pivot, dynamic: canopyDynamic(ctx, SUIT_CANOPY, size[1] / 2) };
}

export function flag(ctx: GenContext): void {
	const { builder: b, size } = ctx;
	const h = size[1];
	b.cylinder('metal', 0.02, h, [0, 0, 0], { segments: 10 });
	b.cylinder('dark-metal', 0.16, 0.04, [0, -h / 2 + 0.02, 0], { segments: 16 });
	b.box('paint-accent', [0.7, 0.45, 0.01], [0.36, h / 2 - 0.3, 0]);
	b.box('paint-primary', [0.7, 0.06, 0.012], [0.36, h / 2 - 0.3, 0]);
}
