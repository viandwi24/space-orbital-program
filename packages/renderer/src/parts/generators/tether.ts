/**
 * Tether parts (plan 313): a winch (a base plate, two cheeks, a drum with the rope coiled on it, a
 * motor and the fairlead the rope leaves through, on +X) and a socket (a plate and an eye on +X).
 * Radial parts: the base is on -X, against the part they hang on.
 */
import type { GenContext } from '../registry.ts';

/** A cylinder along X (`axis` 'x') or Z centred at `at`. */
const along = (axis: 'x' | 'z') =>
	axis === 'x' ? { tiltZ: Math.PI / 2 } : { tiltZ: Math.PI / 2, turnY: Math.PI / 2 };

export function winch(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [0.05, sy, sz], [-hx + 0.025, 0, 0]);
	for (const s of [-1, 1])
		b.box('paint-primary', [sx * 0.72, sy * 0.9, 0.04], [0, 0, s * (sz / 2 - 0.03)]);
	b.cylinder('metal', 0.14, sz * 0.78, [0.01, 0, 0], along('z'));
	// the rope coiled on the drum
	b.cylinder('rubber', 0.165, sz * 0.62, [0.01, 0, 0], along('z'));
	b.cylinder('dark-metal', 0.07, 0.14, [-0.08, sy * 0.33, 0], along('z'));
	// the fairlead on the outer face
	b.box('paint-accent', [0.05, 0.1, 0.1], [hx - 0.03, 0, 0]);
	b.cylinder('dark-metal', 0.025, 0.06, [hx - 0.01, 0, 0], along('x'));
}

export function tetherSocket(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [0.03, sy, sz], [-hx + 0.015, 0, 0]);
	b.cylinder('metal', 0.03, sx * 0.6, [-hx + 0.03 + sx * 0.3, 0, 0], along('x'));
	b.cylinder('paint-accent', 0.1, 0.04, [hx - 0.03, 0, 0], along('x'));
	b.cylinder('rubber', 0.06, 0.046, [hx - 0.03, 0, 0], along('x'));
}
