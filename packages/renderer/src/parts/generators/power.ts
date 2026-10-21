/**
 * Power parts (plan 280, ADR 0259): flat body panels, folding and tracking arrays, a pair of stack
 * wings, batteries, an RTG and a fuel cell. Radial parts mount on their -X face (their radial node);
 * deployable arrays unfold by the deploy progress (`dyn.ts`).
 */
import type { GeneratedPart, GenContext } from '../registry.ts';
import type { GeometryBuilder } from '../builder.ts';
import { boltCircle, hazardStripe, rim, stubPipe } from './kit.ts';
import { phase, pieces, type Piece } from './dyn.ts';

/** Solar cells on a plate facing +X at `x`, covering `h` (Y) by `w` (Z) around (y, z). */
function cellsX(
	b: GeometryBuilder,
	x: number,
	y: number,
	z: number,
	h: number,
	w: number,
	rows: number,
	cols: number
): void {
	const gap = Math.min(h, w) * 0.03;
	const ch = (h - gap * (rows + 1)) / rows;
	const cw = (w - gap * (cols + 1)) / cols;
	if (ch <= 0 || cw <= 0) return;
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++)
			b.box(
				'glass',
				[0.004, ch, cw],
				[x, y - h / 2 + gap + ch / 2 + r * (ch + gap), z - w / 2 + gap + cw / 2 + c * (cw + gap)]
			);
}

/** A framed solar panel lying in the YZ plane, centred on (x, y, z), cells facing +X. */
function panelX(
	b: GeometryBuilder,
	x: number,
	y: number,
	z: number,
	h: number,
	w: number,
	rows = 3,
	cols = 2
): void {
	b.box('metal', [0.012, h, w], [x, y, z]);
	b.box('paint-primary', [0.016, h, 0.012], [x, y, z - w / 2]);
	b.box('paint-primary', [0.016, h, 0.012], [x, y, z + w / 2]);
	cellsX(b, x + 0.008, y, z, h * 0.96, w * 0.96, rows, cols);
}

/** A fixed body panel (OX-STAT kind): a thin framed plate of cells on the hull. */
export function solarFlat(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [sx * 0.5, sy, sz], [-hx + sx * 0.25, 0, 0]);
	panelX(b, hx - sx * 0.3, 0, 0, sy * 0.96, sz * 0.96, 4, 4);
}

/**
 * A folding array (1x6 kind): a housing on the hull; deployed, an arm reaches out and six panels
 * slide out to both sides along the hull, facing out.
 */
export function solarFold(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const reach = ctx.param('reach', 0.35, 0.1, 2);
	const panelH = ctx.param('panel', 0.42, 0.1, 2);
	const count = Math.round(ctx.param('panels', 3, 1, 6));
	b.box('dark-metal', [sx * 0.3, sy, sz], [-hx + sx * 0.15, 0, 0]);
	b.box('paint-primary', [sx * 0.6, sy * 0.9, sz * 0.9], [-hx + sx * 0.6, 0, 0]);
	const arm: Piece = {
		build: (g) => {
			g.box('metal', [reach, 0.04, 0.04], [reach / 2, 0, 0]);
			g.box('dark-metal', [0.05, 0.12, 0.12], [reach, 0, 0]);
		},
		pose: (o, p) => {
			const e = phase(p, 0, 0.35);
			o.visible = p > 0.001;
			o.position.set(hx - reach * (1 - e) - 0.01, 0, 0);
			o.scale.set(Math.max(0.01, e), 1, 1);
		}
	};
	const list: Piece[] = [arm];
	for (const s of [-1, 1] as const) {
		for (let k = 0; k < count; k++) {
			list.push({
				build: (g) => panelX(g, 0, 0, 0, panelH, sz * 0.95),
				pose: (o, p) => {
					const e = phase(p, 0.3, 1);
					o.visible = p > 0.3;
					o.position.set(hx + reach * 0.15 - 0.01 + 0.03, s * (panelH * (k + 0.5)) * e, 0);
				}
			});
		}
	}
	return { dynamic: pieces(ctx, list) };
}

/**
 * A large tracking array (Gigantor / ISS kind): a mast swings out from its housing and two long
 * wings unroll along the hull. The module turns the wings to the star about the part's +Y axis.
 */
export function solarArray(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const mast = ctx.param('mast', 0.6, 0.2, 3);
	const wing = ctx.param('wing', 2.4, 0.5, 12);
	const width = ctx.param('width', 0.9, 0.2, 4);
	b.box('dark-metal', [sx * 0.3, sy, sz], [-hx + sx * 0.15, 0, 0]);
	b.box('paint-primary', [sx * 0.7, sy * 0.95, sz * 0.8], [-hx + sx * 0.65, 0, 0]);
	boltCircle(b, 'metal', 6, sz * 0.3, sy * 0.45);
	const segs = 6;
	const list: Piece[] = [
		{
			build: (g) => {
				g.cylinder('metal', 0.04, mast, [mast / 2, 0, 0], { tiltZ: Math.PI / 2, segments: 12 });
				g.box('dark-metal', [0.12, 0.2, 0.12], [mast, 0, 0]);
			},
			pose: (o, p) => {
				const e = phase(p, 0, 0.3);
				o.visible = p > 0.001;
				o.position.set(hx - mast * (1 - e), 0, 0);
			}
		}
	];
	for (const s of [-1, 1] as const) {
		for (let k = 0; k < segs; k++) {
			const segH = wing / segs;
			list.push({
				build: (g) => panelX(g, 0, 0, 0, segH * 0.98, width, 2, 3),
				pose: (o, p) => {
					const e = phase(p, 0.25, 1);
					o.visible = p > 0.25;
					o.position.set(hx + mast * 0.98, s * (0.12 + segH * (k + 0.5)) * e, 0);
				}
			});
		}
		// the boom along the wing's middle
		list.push({
			build: (g) => g.box('metal', [0.02, wing, 0.03], [0, s * (0.12 + wing / 2), 0]),
			pose: (o, p) => {
				const e = phase(p, 0.25, 1);
				o.visible = p > 0.25;
				o.position.set(hx + mast * 0.98 - 0.02, 0, 0);
				o.scale.set(1, Math.max(0.01, e), 1);
			}
		});
	}
	return { dynamic: pieces(ctx, list) };
}

/**
 * A pair of wings on a stack ring (Soyuz / satellite kind): a short drum with two hinges; deployed,
 * each wing unfolds sideways (±X) in four panels, facing +Z.
 */
export function solarWings(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const panel = ctx.param('panel', 0.7, 0.2, 3);
	const count = Math.round(ctx.param('panels', 4, 1, 8));
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + 0.04 },
		{ r: R * 0.95, y: -h2 + 0.04 }
	]);
	b.revolve('paint-primary', [
		{ r: R * 0.95, y: -h2 + 0.04 },
		{ r: R * 0.95, y: h2 - 0.04 }
	]);
	b.revolve('dark-metal', [
		{ r: R * 0.95, y: h2 - 0.04 },
		{ r: R, y: h2 - 0.04 },
		{ r: R, y: h2 },
		{ r: 0, y: h2 }
	]);
	for (const s of [-1, 1] as const)
		b.box('dark-metal', [0.04, H * 0.5, 0.12], [s * R * 0.95, 0, 0]);
	const list: Piece[] = [];
	for (const s of [-1, 1] as const) {
		for (let k = 0; k < count; k++) {
			list.push({
				build: (g) => {
					// a panel in the XY plane facing +Z: frame, then cells
					g.box('metal', [panel * 0.98, H * 0.9, 0.012], [0, 0, 0]);
					const rows = ctx.detail.extras >= 1 ? 2 : 1;
					const cols = ctx.detail.extras >= 1 ? 3 : 1;
					const gap = 0.01;
					const ch = (H * 0.86 - gap * (rows + 1)) / rows;
					const cw = (panel * 0.94 - gap * (cols + 1)) / cols;
					for (let r = 0; r < rows; r++)
						for (let c = 0; c < cols; c++)
							g.box(
								'glass',
								[cw, ch, 0.004],
								[
									-panel * 0.47 + gap + cw / 2 + c * (cw + gap),
									-H * 0.43 + gap + ch / 2 + r * (ch + gap),
									0.008
								]
							);
				},
				pose: (o, p) => {
					const e = phase(p, 0.1, 1);
					o.visible = p > 0.1;
					o.position.set(s * (R + 0.04 + panel * (k + 0.5) * e), 0, 0);
				}
			});
		}
	}
	return { dynamic: pieces(ctx, list) };
}

/** A battery: a stack disc of cells (cylinder shape) or a radial pack (box shape). */
export function battery(ctx: GenContext): void {
	const b = ctx.builder;
	if (ctx.visual.params?.radial === true) {
		const [sx, sy, sz] = ctx.size;
		const hx = sx / 2;
		b.box('dark-metal', [sx * 0.2, sy, sz], [-hx + sx * 0.1, 0, 0]);
		b.box('paint-secondary', [sx * 0.8, sy * 0.92, sz * 0.92], [-hx + sx * 0.6, 0, 0]);
		const cells = 4;
		for (let i = 0; i < cells; i++)
			b.box(
				'paint-primary',
				[0.006, sy * 0.8, (sz * 0.8) / cells - 0.01],
				[hx - 0.002, 0, -sz * 0.4 + ((i + 0.5) * sz * 0.8) / cells]
			);
		b.box('paint-accent', [0.01, sy * 0.1, sz * 0.2], [hx - 0.004, sy * 0.38, -sz * 0.25]);
		b.box('dark-metal', [0.01, sy * 0.1, sz * 0.2], [hx - 0.004, sy * 0.38, sz * 0.25]);
		return;
	}
	const { radius: R, height: H } = ctx;
	const h2 = H / 2;
	const collar = Math.min(0.04, H * 0.2);
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + collar },
		{ r: R * 0.9, y: -h2 + collar }
	]);
	b.revolve('paint-secondary', [
		{ r: R * 0.9, y: -h2 + collar },
		{ r: R * 0.9, y: h2 - collar }
	]);
	b.revolve('dark-metal', [
		{ r: R * 0.9, y: h2 - collar },
		{ r: R, y: h2 - collar },
		{ r: R, y: h2 },
		{ r: 0, y: h2 }
	]);
	// cells round the side, a charge stripe in the accent
	const cells = Math.max(8, Math.round(R * 16));
	for (let i = 0; i < cells; i++) {
		const a = ((i + 0.5) / cells) * Math.PI * 2;
		b.box(
			'paint-primary',
			[((2 * Math.PI * R * 0.9) / cells) * 0.7, (H - collar * 2) * 0.7, 0.012],
			[Math.sin(a) * R * 0.9, 0, Math.cos(a) * R * 0.9],
			a
		);
	}
	rim(b, 'paint-accent', R * 0.9, h2 - collar - 0.012, 0.012, 0.004);
}

/** A radioisotope generator: a finned core on a bracket, with hazard bands at both ends. */
export function rtg(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const core = Math.min(sx, sz) * 0.18;
	const cx = 0;
	const fins = 8;
	b.box('dark-metal', [sx * 0.12, sy * 0.5, sz * 0.4], [-hx + sx * 0.06, 0, 0]);
	b.box('metal', [sx * 0.3, 0.05, 0.05], [-hx + sx * 0.25, sy * 0.15, 0]);
	b.box('metal', [sx * 0.3, 0.05, 0.05], [-hx + sx * 0.25, -sy * 0.15, 0]);
	b.cylinder('dark-metal', core, sy * 0.9, [cx, 0, 0], { segments: 16 });
	for (let i = 0; i < fins; i++) {
		const a = (i / fins) * Math.PI * 2;
		const finW = Math.min(sx, sz) / 2 - core - 0.01;
		b.box(
			'metal',
			[0.01, sy * 0.78, finW],
			[cx + Math.sin(a) * (core + finW / 2), 0, Math.cos(a) * (core + finW / 2)],
			a
		);
	}
	for (const y of [sy * 0.44, -sy * 0.44])
		b.cylinder('dark-metal', core * 1.15, sy * 0.04, [cx, y, 0], { segments: 16 });
	hazardStripe(b, core, sy * 0.36, sy * 0.4, { count: 8, out: 0.002 });
}

/** A fuel cell: a box with a vent grille, two feed pipes and a valve. */
export function fuelCell(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [sx * 0.15, sy, sz], [-hx + sx * 0.075, 0, 0]);
	b.box('paint-primary', [sx * 0.7, sy * 0.9, sz * 0.85], [-hx + sx * 0.5, 0, 0]);
	b.box('paint-secondary', [0.006, sy * 0.5, sz * 0.6], [-hx + sx * 0.85 + 0.003, sy * 0.1, 0]);
	for (let i = 0; i < 6; i++)
		b.box('dark-metal', [0.008, sy * 0.03, sz * 0.5], [-hx + sx * 0.86, sy * (0.25 - i * 0.07), 0]);
	for (const z of [-sz * 0.3, sz * 0.3])
		stubPipe(b, 'metal', [-hx + sx * 0.2, -sy * 0.45, z], [0, 1, 0], sy * 0.9, 0.012, 10);
	b.cylinder('paint-accent', 0.025, 0.03, [hx - 0.03, -sy * 0.3, 0], {
		tiltZ: Math.PI / 2,
		segments: 12
	});
}
