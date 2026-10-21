/**
 * Attach-node sizes (plan 207, ADR 0212): the diameter of a joint face, metres. Two stack parts
 * fit when their joined nodes have the same size; the Hangar marks a joint that does not.
 */
import type { PartDefinition } from './definitions.ts';

/**
 * The stock size classes, m (ADR 0256): 0.625 to 7.5. With 1.875 (plan 289), a size-less cylinder
 * about 1.53–2.17 m across infers 1.875, where it inferred 1.25 or 2.5 before.
 */
export const NODE_SIZES = [0.625, 1.25, 1.875, 2.5, 3.75, 5, 7.5] as const;

/** Two sizes within this many metres are the same size. */
export const NODE_SIZE_TOLERANCE = 0.001;

/** The size class nearest to `diameter` (by ratio), m. */
export function nodeSizeClass(diameter: number): number {
	let best: number = NODE_SIZES[0];
	for (const size of NODE_SIZES) {
		if (Math.abs(Math.log(diameter / size)) < Math.abs(Math.log(diameter / best))) best = size;
	}
	return best;
}

/** The node faces along the part's axis (a stack node), not sideways (radial, connector). */
const isAxial = (dir: readonly [number, number, number]): boolean =>
	Math.abs(dir[1]) > 0.999 && Math.abs(dir[0]) < 1e-6 && Math.abs(dir[2]) < 1e-6;

/**
 * Size of node `node` of `part`, m: its declared `size`, else for a stack node of a cylinder part
 * the class of the part's diameter (parts written before plan 207). Undefined for a radial or
 * connector node, a box part's node without a size, or a node the part does not have.
 */
export function nodeSize(
	part: Pick<PartDefinition, 'attach' | 'shape'>,
	node: string
): number | undefined {
	const n = part.attach?.[node];
	if (!n) return undefined;
	if (n.size !== undefined) return n.size;
	if (!isAxial(n.dir) || part.shape?.kind !== 'cylinder') return undefined;
	return nodeSizeClass(part.shape.radius * 2);
}

/** Whether two node sizes fit; a node without a size fits anything. */
export function nodeSizesMatch(a: number | undefined, b: number | undefined): boolean {
	return a === undefined || b === undefined || Math.abs(a - b) <= NODE_SIZE_TOLERANCE;
}

/**
 * The definition as one design entry has it (plan 243, ADR 0238): a node marked `shellTop` sits at
 * the top of its module's shell, `baseTop` plus the heights of the sections, and is as wide as the
 * last section; it exists only while the module's `interstage` setting is on and has a section.
 * `settings` are the entry's per-part settings, merged over the definition's module config. A
 * definition without such a node is returned as it is.
 */
export function effectiveDef(
	def: PartDefinition,
	settings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
): PartDefinition {
	const attach = def.attach;
	if (!attach || !Object.values(attach).some((n) => n.shellTop !== undefined)) return def;
	const nodes: Record<string, NonNullable<PartDefinition['attach']>[string]> = {};
	for (const [name, node] of Object.entries(attach)) {
		if (node.shellTop === undefined) {
			nodes[name] = node;
			continue;
		}
		const base = def.modules?.find(([id]) => id === node.shellTop)?.[1] as
			Record<string, unknown> | undefined;
		const cfg = { ...base, ...settings?.[node.shellTop] } as {
			interstage?: unknown;
			baseTop?: unknown;
			sections?: unknown;
		};
		const sections = Array.isArray(cfg.sections)
			? (cfg.sections as Array<{ height?: unknown; radius?: unknown }>)
			: [];
		const last = sections.at(-1);
		if (cfg.interstage !== true || !last) continue;
		const top =
			(typeof cfg.baseTop === 'number' ? cfg.baseTop : 0) +
			sections.reduce((h, s) => h + (typeof s.height === 'number' ? s.height : 0), 0);
		nodes[name] = {
			pos: [node.pos[0], top, node.pos[2]],
			dir: node.dir,
			size: (typeof last.radius === 'number' ? last.radius : 0.5) * 2
		};
	}
	return { ...def, attach: nodes };
}
