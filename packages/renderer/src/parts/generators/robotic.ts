/**
 * Robotic parts (plan 306, ADR 0269). The moving half is `ctx.moving`, posed by the part's
 * articulation from the joint's applied pose:
 * - `hinge`: two plates on a knuckle across X, the top plate turns about X (`hinge` mode);
 * - `servo` and `rotor`: a drum whose top plate turns about Y (`spin` mode);
 * - `piston`: a barrel whose rod and top cap slide up (`slide` mode).
 */
import type { GenContext, GeneratedPart } from '../registry.ts';
import { boltCircle, hazardStripe, rim } from './kit.ts';

export function hingeJoint(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, moving: m, detail } = ctx;
	const h2 = sy / 2;
	const plate = sy * 0.18;
	const knuckle = Math.min(sz, sy * 0.5) * 0.46;
	// the fixed plate and its two outer knuckles
	b.box('dark-metal', [sx, plate, sz], [0, -h2 + plate / 2, 0]);
	b.box(
		'paint-primary',
		[sx * 0.9, h2 - plate - knuckle * 0.4, sz * 0.5],
		[0, -h2 + plate + (h2 - plate - knuckle * 0.4) / 2, 0]
	);
	for (const side of [-1, 1]) {
		b.cylinder('metal', knuckle, sx * 0.28, [side * sx * 0.34, 0, 0], { tiltZ: Math.PI / 2 });
	}
	// the moving plate and its middle knuckle
	m.box('dark-metal', [sx, plate, sz], [0, h2 - plate / 2, 0]);
	m.box(
		'paint-primary',
		[sx * 0.36, h2 - plate - knuckle * 0.4, sz * 0.5],
		[0, h2 - plate - (h2 - plate - knuckle * 0.4) / 2, 0]
	);
	m.cylinder('paint-accent', knuckle * 0.96, sx * 0.38, [0, 0, 0], { tiltZ: Math.PI / 2 });
	if (detail.extras >= 1) {
		b.cylinder('dark-metal', knuckle * 0.35, sx * 0.98, [0, 0, 0], {
			tiltZ: Math.PI / 2,
			segments: 12
		});
		b.box('paint-accent', [sx * 0.92, 0.03, sz * 0.52], [0, -h2 + plate + 0.03, 0]);
	}
	return { pivot: [0, 0, 0] };
}

/** A rotation servo or a rotor: the top plate turns on the drum. */
export function rotaryJoint(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, moving: m, detail } = ctx;
	const h2 = H / 2;
	const split = h2 - Math.max(0.05, H * 0.3);
	const rotor = ctx.param('rotor', 0, 0, 1) > 0.5;
	b.revolve('dark-metal', [
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + 0.04 },
		{ r: R * 0.93, y: -h2 + 0.06 },
		{ r: R * 0.93, y: split - 0.02 },
		{ r: R * 0.7, y: split }
	]);
	if (rotor) {
		// cooling fins round the motor
		const n = detail.extras >= 1 ? 16 : 8;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			b.box(
				'metal',
				[0.012, (split + h2) * 0.6, R * 0.05],
				[Math.sin(a) * R * 0.95, (-h2 + split) / 2, Math.cos(a) * R * 0.95],
				a
			);
		}
	} else {
		rim(b, 'paint-accent', R * 0.93, (-h2 + split) / 2, 0.04, 0.01);
	}
	m.revolve('paint-primary', [
		{ r: R * 0.7, y: split },
		{ r: R, y: split + 0.02 },
		{ r: R, y: h2 }
	]);
	// a marker so the turn reads
	m.box('paint-accent', [R * 0.5, 0.012, R * 0.12], [R * 0.6, h2 - 0.007, 0]);
	if (detail.extras >= 1) boltCircle(m, 'metal', 8, R * 0.75, h2 - 0.012, { face: 'top' });
	return { pivot: [0, 0, 0] };
}

/** A piston: the rod and the top cap slide out of the barrel. */
export function pistonJoint(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, moving: m, detail } = ctx;
	const h2 = H / 2;
	const cap = Math.min(0.08, H * 0.12);
	const travel = ctx.param('travel', H * 0.8, 0.05, H * 0.9);
	b.revolve('paint-primary', [
		{ r: R, y: -h2 },
		{ r: R, y: h2 - cap - 0.02 },
		{ r: R * 0.62, y: h2 - cap }
	]);
	if (detail.extras >= 1) {
		rim(b, 'dark-metal', R - 0.008, -h2 + 0.05, 0.04, 0.008);
		hazardStripe(b, R - 0.006, -h2 + 0.1, -h2 + 0.14, { out: 0.005 });
	}
	// the rod hides in the barrel when retracted
	m.cylinder('metal', R * 0.5, travel, [0, h2 - cap - travel / 2, 0]);
	m.revolve('dark-metal', [
		{ r: R * 0.62, y: h2 - cap },
		{ r: R, y: h2 - cap + 0.02 },
		{ r: R, y: h2 }
	]);
	return { pivot: [0, 0, 0] };
}
