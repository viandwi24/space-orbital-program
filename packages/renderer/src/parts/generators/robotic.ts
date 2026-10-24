/**
 * Robotic parts (plan 306, ADR 0269). The moving half is `ctx.moving`, posed by the part's
 * articulation from the joint's applied pose:
 * - `hinge`: two plates on a knuckle across X, the top plate turns about X (`hinge` mode);
 * - `servo` and `rotor`: a drum whose top plate turns about Y (`spin` mode);
 * - `piston`: a barrel whose rod and top cap slide up (`slide` mode), a stepped rod when it has stages;
 * - the alligator hinge (plan 282): a fixed lower jaw and an upper jaw that swings open about the
 *   back edge (`hinge` mode, pivot at the edge).
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
	const stages = Math.round(ctx.param('stages', 1, 1, 4));
	const travel = ctx.param('travel', H * 0.8, 0.05, H * 0.95);
	b.revolve('paint-primary', [
		{ r: R, y: -h2 },
		{ r: R, y: h2 - cap - 0.02 },
		{ r: R * 0.62, y: h2 - cap }
	]);
	if (detail.extras >= 1) {
		rim(b, 'dark-metal', R - 0.008, -h2 + 0.05, 0.04, 0.008);
		hazardStripe(b, R - 0.006, -h2 + 0.1, -h2 + 0.14, { out: 0.005 });
	}
	// the rod hides in the barrel when retracted; stages are steps of it, thinner toward the cap
	for (let i = 0; i < stages; i++) {
		const len = travel / stages;
		const r = R * (stages === 1 ? 0.5 : 0.62 - (0.32 * i) / stages);
		m.cylinder(i % 2 === 0 ? 'metal' : 'dark-metal', r, len, [
			0,
			h2 - cap - travel + len * (i + 0.5),
			0
		]);
	}
	m.revolve('dark-metal', [
		{ r: R * 0.62, y: h2 - cap },
		{ r: R, y: h2 - cap + 0.02 },
		{ r: R, y: h2 }
	]);
	return { pivot: [0, 0, 0] };
}

/**
 * The alligator hinge (plan 282): a lower jaw fixed to the base and an upper jaw, with a back web,
 * that swings open about the back edge. The pivot is the generator's (`GeneratedPart.pivot`) and
 * must equal the joint's `pivot` in the part's module config.
 */
export function alligatorJoint(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, moving: m, detail } = ctx;
	const h2 = sy / 2;
	const plate = sy * 0.16;
	const pivot: [number, number, number] = [0, -h2 + plate, -sz / 2];
	// the lower jaw: a plate with a back hinge block
	b.box('dark-metal', [sx, plate, sz], [0, -h2 + plate / 2, 0]);
	b.box('paint-primary', [sx * 0.9, plate * 1.2, sz * 0.18], [0, -h2 + plate * 1.1, -sz * 0.41]);
	// teeth along the front edge of the lower jaw
	const teeth = detail.extras >= 1 ? 5 : 3;
	for (let i = 0; i < teeth; i++) {
		const x = (-0.5 + (i + 0.5) / teeth) * sx * 0.9;
		b.box(
			'paint-accent',
			[((sx * 0.9) / teeth) * 0.6, plate * 0.8, sz * 0.08],
			[x, -h2 + plate * 1.4, sz * 0.46]
		);
	}
	// the upper jaw and its web turn about the back edge
	m.box('dark-metal', [sx, plate, sz], [0, h2 - plate / 2, 0]);
	m.box(
		'paint-primary',
		[sx * 0.9, h2 - plate - pivot[1] - plate * 0.2, sz * 0.14],
		[0, (pivot[1] + plate * 0.1 + h2 - plate) / 2, -sz * 0.43]
	);
	for (let i = 0; i < teeth; i++) {
		const x = (-0.5 + (i + 0.5) / teeth) * sx * 0.9;
		m.box(
			'paint-accent',
			[((sx * 0.9) / teeth) * 0.6, plate * 0.8, sz * 0.08],
			[x, h2 - plate * 1.4, sz * 0.46]
		);
	}
	m.cylinder('paint-accent', plate * 0.55, sx * 0.96, [0, pivot[1], pivot[2]], {
		tiltZ: Math.PI / 2
	});
	return { pivot };
}
