/**
 * A rover wheel (plan 307): a mount on the hull, an arm out along +X with a coil-over strut, a
 * hub with a motor drum and a tyre with tread blocks. Like the landing gear, the disc is in the
 * X-Y plane (rolling along Y), the axle along Z.
 */
import { Matrix4, Shape } from 'three';
import type { GenContext } from '../registry.ts';

export function roverWheel(ctx: GenContext): void {
	const { builder: b, detail } = ctx;
	const [sx, sy, sz] = ctx.size;
	const reach = ctx.param('offset', 0.6, 0, 3);
	const radius = ctx.param('radius', 0.4, 0.05, 2);
	const width = ctx.param('width', 0.25, 0.02, 1);
	const root = -sx / 2;
	// the mount plate on the hull
	b.box('dark-metal', [0.06, sy, sz], [root + 0.03, 0, 0]);
	b.box('paint-primary', [sx * 0.5, sy * 0.6, sz * 0.7], [root + sx * 0.3, 0, 0]);
	// the arm to the hub, beside the tyre
	const side = width / 2 + 0.05;
	const arm = reach - radius * 0.3 - root;
	b.box('metal', [arm, 0.08, 0.06], [root + arm / 2, -radius * 0.15, -side]);
	// the coil-over strut from the mount up to the arm's end
	const strut = Math.hypot(reach - root - sx * 0.4, radius * 0.6);
	const tilt = Math.atan2(radius * 0.6, reach - root - sx * 0.4);
	b.cylinder(
		'paint-accent',
		0.045,
		strut,
		[(root + sx * 0.4 + reach - radius * 0.3) / 2, radius * 0.15, -side],
		{ tiltZ: Math.PI / 2 - tilt, segments: 10 }
	);
	if (detail.extras >= 1) {
		const coils = 6;
		for (let i = 0; i < coils; i++) {
			const t = (i + 0.5) / coils;
			const x = root + sx * 0.4 + (reach - radius * 0.3 - root - sx * 0.4) * t;
			const y = radius * 0.45 - radius * 0.6 * t;
			b.cylinder('metal', 0.07, 0.015, [x, y, -side], {
				tiltZ: Math.PI / 2 - tilt,
				segments: 10
			});
		}
	}
	const disc = (r: number, w: number, slot: 'dark-metal' | 'metal' | 'paint-primary', z = 0) => {
		const s = new Shape();
		s.absarc(0, 0, r, 0, Math.PI * 2, false);
		b.extrude(slot, s, w, new Matrix4().makeTranslation(reach, 0, z - w / 2));
	};
	// tyre, rim and hub drum
	disc(radius * 0.93, width, 'dark-metal');
	disc(radius * 0.62, width * 1.04, 'paint-primary');
	disc(radius * 0.3, width * 1.3, 'metal', -width * 0.1);
	// tread blocks round the tyre
	const blocks = detail.extras >= 1 ? 18 : 10;
	for (let i = 0; i < blocks; i++) {
		const a = (i / blocks) * Math.PI * 2;
		const r = radius * 0.965;
		b.box(
			'dark-metal',
			[radius * 0.07, radius * 0.16, width * 0.96],
			[reach + Math.cos(a) * r, Math.sin(a) * r, 0],
			0,
			a
		);
	}
}

/** A rover deck (plan 307): a flat frame along +Y with side rails, battery packs and bumpers. */
export function roverChassis(ctx: GenContext): void {
	const { builder: b, detail } = ctx;
	const [sx, sy, sz] = ctx.size;
	const hx = sx / 2;
	const hy = sy / 2;
	const hz = sz / 2;
	// the deck plate and the frame under it
	const top = hz - 0.04;
	b.box('paint-primary', [sx * 0.96, sy * 0.96, sz * 0.25], [0, 0, top - sz * 0.125]);
	b.box('dark-metal', [sx * 0.7, sy * 0.9, sz * 0.75], [0, 0, -hz + sz * 0.375]);
	for (const side of [-1, 1]) {
		// side rails
		b.box('metal', [0.08, sy, sz * 0.5], [side * (hx - 0.04), 0, 0]);
		// bumpers fore and aft
		b.box('paint-accent', [sx * 0.8, 0.08, sz * 0.4], [0, side * (hy - 0.04), 0]);
	}
	// battery packs on the deck
	const packs = detail.extras >= 1 ? 3 : 2;
	for (let i = 0; i < packs; i++) {
		const y = -hy * 0.6 + (i * hy * 1.2) / Math.max(1, packs - 1);
		b.box('dark-metal', [sx * 0.3, sy * 0.12, 0.04], [-hx * 0.45, y, top + 0.02]);
	}
	if (detail.extras >= 1) {
		for (const x of [0.15, 0.35]) b.box('metal', [0.04, sy * 0.85, 0.02], [x * sx, 0, top + 0.01]);
	}
}
