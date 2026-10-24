/**
 * Rover and outpost gear (plan 283): a scanning arm that studies a rock, an external seat (a chair
 * with a harness, no hull) and the surface drill's rig. The arm is a box part on a hull's side
 * (the node on -X); the seat and the drill stand on stack nodes, so they carry the forged collars
 * of the other stack parts at the node radius (the seam rule, ADR 0212).
 */
import type { GenContext } from '../registry.ts';

/** A boom from the hull's side down to a sensor head: plate, boom, elbow, forearm, head and claw. */
export function scanArm(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const top = sy / 2;
	const thick = Math.min(sx, sz) * 0.2;
	// the mounting plate on the hull side, at the top
	b.box('dark-metal', [sx * 0.26, 0.14, sz * 0.8], [-sx * 0.37, top - 0.07, 0]);
	// the shoulder joint and the upper boom, hanging from it
	b.cylinder('metal', thick * 0.9, thick * 2.2, [-sx * 0.2, top - 0.12, 0], { segments: 12 });
	const upper = sy * 0.5;
	b.box('paint-primary', [thick, upper, thick], [-sx * 0.2, top - 0.12 - upper / 2, 0]);
	// the elbow, and the forearm angled out and down to the head
	const elbowY = top - 0.12 - upper;
	b.cylinder('metal', thick * 0.8, thick * 1.8, [-sx * 0.2, elbowY, 0], { segments: 10 });
	const lower = sy * 0.42;
	b.box('paint-primary', [thick * 0.8, lower, thick * 0.8], [-sx * 0.2, elbowY - lower / 2, 0]);
	// the sensor head: a housing, a lens and two claw fingers at the tip
	const headY = elbowY - lower - 0.05;
	b.box('dark-metal', [thick * 1.6, 0.1, thick * 1.6], [-sx * 0.2, headY, 0]);
	b.cylinder('glass', thick * 0.45, 0.02, [-sx * 0.2 + thick * 0.7, headY, 0], {
		tiltZ: Math.PI / 2,
		segments: 10
	});
	for (const s of [-1, 1]) {
		b.box('metal', [thick * 0.4, 0.12, thick * 0.25], [-sx * 0.2, headY - 0.1, s * thick * 0.55]);
	}
	if (detail.extras >= 1) {
		b.box(
			'paint-accent',
			[thick * 1.02, 0.05, thick * 1.02],
			[-sx * 0.2, top - 0.12 - upper * 0.5, 0]
		);
	}
}

/** An external seat: a chair on a base plate, with armrests, a harness and a life-support pack. */
export function seatExternal(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const plate = 0.07;
	// the base plate that carries the joint (its rim is the node radius)
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R * 0.94, y: -h2 },
		{ r: R, y: -h2 + 0.02 },
		{ r: R, y: -h2 + plate },
		{ r: R * 0.5, y: -h2 + plate + 0.02 },
		{ r: R * 0.18, y: -h2 + plate + 0.04 }
	]);
	// the pedestal, the seat pan and the back
	b.cylinder('metal', 0.07, 0.2, [0, -h2 + plate + 0.1, 0], { segments: 10 });
	const pan = -h2 + plate + 0.2;
	b.box('paint-primary', [0.5, 0.07, 0.5], [0, pan, 0]);
	b.box('paint-primary', [0.07, 0.6, 0.5], [-0.22, pan + 0.33, 0]);
	// the headrest and the life-support pack behind
	if (detail.extras >= 1) {
		b.box('paint-secondary', [0.1, 0.16, 0.3], [-0.25, pan + 0.72, 0]);
		b.box('metal', [0.14, 0.45, 0.38], [-0.33, pan + 0.36, 0]);
	}
	// armrests and the harness
	for (const s of [-1, 1]) {
		b.box('dark-metal', [0.34, 0.04, 0.05], [0.02, pan + 0.22, s * 0.28]);
		b.box('paint-accent', [0.03, 0.5, 0.05], [-0.17, pan + 0.34, s * 0.12]);
	}
	if (detail.extras >= 1) {
		b.box('paint-accent', [0.04, 0.05, 0.3], [-0.16, pan + 0.18, 0]);
		b.box('metal', [0.05, 0.03, 0.4], [0.28, pan - 0.01, 0]);
	}
}

/**
 * The surface drill's rig: collars at both nodes, four struts, a motor housing on top and the
 * auger inside, a stem with spiral flights down to the bit.
 */
export function drillRig(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const collar = 0.07;
	const lower = [
		{ r: 0, y: -h2 },
		{ r: R * 0.94, y: -h2 },
		{ r: R, y: -h2 + 0.02 },
		{ r: R, y: -h2 + collar }
	];
	b.revolve('dark-metal', lower);
	b.revolve('dark-metal', [
		{ r: R, y: h2 - collar },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
	// four struts between the collars, a little inside the rim
	const cage = R * 0.82;
	for (let i = 0; i < 4; i++) {
		const a = ((i + 0.5) / 4) * Math.PI * 2;
		b.box(
			'paint-primary',
			[0.07, H - 2 * collar, 0.07],
			[Math.sin(a) * cage, 0, Math.cos(a) * cage],
			a
		);
	}
	// the motor housing under the top collar
	const motorTop = h2 - collar;
	b.revolve('paint-accent', [
		{ r: R * 0.34, y: motorTop - 0.2 },
		{ r: R * 0.42, y: motorTop - 0.16 },
		{ r: R * 0.42, y: motorTop - 0.02 },
		{ r: R * 0.3, y: motorTop }
	]);
	// the stem and the auger flights
	const stemTop = motorTop - 0.2;
	const stemBottom = -h2 + collar + 0.04;
	b.cylinder('metal', 0.045, stemTop - stemBottom, [0, (stemTop + stemBottom) / 2, 0], {
		segments: 10
	});
	const flights = detail.extras >= 1 ? 6 : 3;
	for (let i = 0; i < flights; i++) {
		const y = stemBottom + ((i + 0.5) * (stemTop - stemBottom)) / flights;
		b.revolve('dark-metal', [
			{ r: 0.045, y: y - 0.02 },
			{ r: R * 0.3, y: y - 0.008 },
			{ r: R * 0.3, y: y + 0.008 },
			{ r: 0.045, y: y + 0.02 }
		]);
	}
	// the bit: a cone at the bottom
	b.revolve('metal', [
		{ r: 0.01, y: stemBottom - 0.03 },
		{ r: 0.07, y: stemBottom + 0.04 },
		{ r: 0.045, y: stemBottom + 0.05 }
	]);
}
