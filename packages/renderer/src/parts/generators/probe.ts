/**
 * Probe core (plan 278): an octagonal body between two round joint collars. Gold foil shows on
 * every other face, white panels with louvres sit on the others, and one panel carries a green
 * status lamp and a small folded antenna. The collars stay round so stack joints meet (ADR 0212).
 */
import { Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { GenContext } from '../registry.ts';
import { boltCircle, louvres, panelInset } from './kit.ts';

export function probe(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const collar = Math.min(0.045, H * 0.14);
	// The octagon's corners touch a circle a little inside the joint, so its faces sit well inside.
	const corner = R * 0.94;
	const face = corner * Math.cos(Math.PI / 8);
	const bodyH = H - collar * 2;

	// Round joint collars at both faces, with a lip.
	for (const s of [-1, 1] as const) {
		const outerY = s * h2;
		const innerY = s * (h2 - collar);
		const ring =
			s < 0
				? [
						{ r: 0, y: outerY },
						{ r: R, y: outerY },
						{ r: R, y: innerY },
						{ r: face, y: innerY }
					]
				: [
						{ r: face, y: innerY },
						{ r: R, y: innerY },
						{ r: R, y: outerY },
						{ r: 0, y: outerY }
					];
		b.revolve('dark-metal', ring);
	}

	// The octagonal body: a prism with flat faces, corners at 0°, 45°, … in the XZ plane.
	const oct = new Shape();
	for (let k = 0; k < 8; k++) {
		const a = (k / 8) * Math.PI * 2;
		const x = Math.sin(a) * corner;
		const z = Math.cos(a) * corner;
		if (k === 0) oct.moveTo(x, z);
		else oct.lineTo(x, z);
	}
	oct.closePath();
	// extrude along +Z of the shape's plane, then turn so it runs up +Y from the bottom collar
	const up = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
	b.extrude(
		'foil',
		oct,
		bodyH,
		new Matrix4().compose(new Vector3(0, -h2 + collar, 0), up, new Vector3(1, 1, 1))
	);

	// White panels on every other face, louvres on two, the lamp and the antenna on one.
	const faceW = 2 * corner * Math.sin(Math.PI / 8);
	for (let k = 0; k < 8; k += 2) {
		const a = ((k + 0.5) / 8) * Math.PI * 2;
		panelInset(b, 'paint-primary', face, a, 0, faceW * 0.84, bodyH * 0.8, 0.005);
		if (detail.extras >= 1 && (k === 2 || k === 6))
			louvres(b, 'dark-metal', face + 0.006, a, -bodyH * 0.25, 5, {
				width: faceW * 0.5,
				pitch: bodyH * 0.1
			});
	}
	if (detail.extras >= 1) {
		const a = (0.5 / 8) * Math.PI * 2;
		// status lamp and a dark display strip
		b.box(
			'lamp',
			[0.04, 0.04, 0.02],
			[Math.sin(a) * (face + 0.012), bodyH * 0.22, Math.cos(a) * (face + 0.012)],
			a
		);
		b.box(
			'dark-metal',
			[faceW * 0.5, bodyH * 0.12, 0.012],
			[Math.sin(a) * (face + 0.01), -bodyH * 0.15, Math.cos(a) * (face + 0.01)],
			a
		);
		// the folded whip antenna lying along a foil face
		const b2 = (1.5 / 8) * Math.PI * 2;
		b.box(
			'metal',
			[0.012, bodyH * 0.75, 0.012],
			[Math.sin(b2) * (face + 0.01), 0, Math.cos(b2) * (face + 0.01)],
			b2
		);
		// bolt heads round both collars, set into the collar wall
		for (const y of [h2 - collar / 2, -h2 + collar / 2])
			boltCircle(b, 'metal', 16, R - 0.006, y, { size: Math.min(0.02, collar * 0.5) });
	}
}
