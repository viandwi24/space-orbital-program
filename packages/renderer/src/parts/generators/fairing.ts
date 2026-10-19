/**
 * Procedural fairings (plan 219, ADR 0224): the base ring, and the shell revolved from the
 * sections in the instance's params (`sections`, a JSON list of `{ height, radius }`, and
 * `closed`). The shell is the moving piece so the `visible` articulation hides it once thrown off.
 * A panel is half of the same shell, drawn about the panel's own origin.
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';

interface Section {
	height: number;
	radius: number;
}

function sectionsOf(ctx: GenContext): Section[] {
	const raw = ctx.visual.params?.sections;
	if (typeof raw !== 'string') return [];
	try {
		const list = JSON.parse(raw) as unknown;
		return Array.isArray(list)
			? list.filter(
					(s): s is Section =>
						typeof s?.height === 'number' && typeof s?.radius === 'number' && s.height > 0
				)
			: [];
	} catch {
		return [];
	}
}

/** The shell's profile, bottom to top, from `bottomY` and the base radius; capped when closed. */
export function shellProfile(
	baseRadius: number,
	bottomY: number,
	sections: readonly Section[],
	closed: boolean
): ProfilePoint[] {
	if (sections.length === 0) return [];
	const out: ProfilePoint[] = [{ r: baseRadius, y: bottomY }];
	let y = bottomY;
	for (const s of sections) {
		y += s.height;
		out.push({ r: s.radius, y });
	}
	if (closed) {
		const r = sections.at(-1)!.radius;
		// an ogive nose to the axis, as tall as the last radius
		for (const t of [0.35, 0.65, 0.88])
			out.push({
				r: r * Math.cos((t * Math.PI) / 2),
				y: y + r * Math.sin((t * Math.PI) / 2),
				smooth: true
			});
		out.push({ r: 0, y: y + r });
	}
	return out;
}

export function fairing(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, moving: m } = ctx;
	const h2 = H / 2;
	// the base ring, walked bottom to top so its faces point out (plan 207)
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: h2 },
		{ r: R * 0.9, y: h2 },
		{ r: 0, y: h2 }
	]);
	const shell = shellProfile(R, h2, sectionsOf(ctx), ctx.visual.params?.closed === true);
	if (shell.length >= 2) m.revolve('paint-primary', shell);
	return { pivot: [0, 0, 0] };
}

export function fairingPanel(ctx: GenContext): void {
	// without sections (the catalogue's preview) a plain half shell a metre tall
	const own = sectionsOf(ctx);
	const sections = own.length > 0 ? own : [{ height: 1, radius: 0.625 }];
	const size = typeof ctx.visual.params?.size === 'number' ? ctx.visual.params.size : 1.25;
	const baseTop = typeof ctx.visual.params?.baseTop === 'number' ? ctx.visual.params.baseTop : 0.1;
	const half = ctx.visual.params?.half === 1 ? 1 : 0;
	const height = sections.reduce((h, s) => h + s.height, 0);
	const wide = Math.max(size / 2, ...sections.map((s) => s.radius));
	const shell = shellProfile(size / 2, baseTop, sections, ctx.visual.params?.closed === true);
	// the half on the panel's side (+X for half 0), about the panel's origin
	const side = half === 0 ? 1 : -1;
	// the panel's origin stands `PANEL_CLEARANCE` (0.15 m) outside the widest radius (stock fairing.ts)
	ctx.builder.revolveAt(
		'paint-primary',
		shell,
		[-side * (wide + 0.15), -(baseTop + height / 2), 0],
		{
			phiStart: half === 0 ? 0 : Math.PI,
			phiLength: Math.PI
		}
	);
}
