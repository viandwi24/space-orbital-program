/**
 * Pure vessel-design editing and (de)serialisation for the VAB. The design itself is the core
 * `VesselDesign` (ADR 0016); validation is `vesselDesignSchema` (shape) + `resolveVesselDesign`
 * (semantics). No DOM here, so it is unit-tested in Node.
 */
import {
	partId,
	resolveVesselDesign,
	vesselDesignSchema,
	type PartLookup,
	type VesselDesign
} from '@orbital/core';

export type DesignPart = VesselDesign['parts'][number];
export interface Attachment {
	/** Index of the part to attach to. */
	index: number;
	/** Node of that part. */
	parentNode: string;
	/** Node of the new part. */
	node: string;
}

export const emptyDesign = (name = 'Untitled vessel'): VesselDesign => ({
	formatVersion: 1,
	name,
	parts: [],
	stages: []
});

const nextIndex = (design: VesselDesign): number =>
	design.parts.reduce((max, p) => Math.max(max, p.index), -1) + 1;

/** Adds a part; the first part (or any part with `attach` null on an empty design) becomes the root. */
export function addPart(
	design: VesselDesign,
	part: string,
	attach: Attachment | null
): VesselDesign {
	if (design.parts.length === 0 && attach !== null) {
		throw new Error('the first part of a design is the root and attaches to nothing');
	}
	if (design.parts.length > 0 && attach === null) {
		throw new Error('only the first part can be the root; pick a part and node to attach to');
	}
	return {
		...design,
		parts: [
			...design.parts,
			{ index: nextIndex(design), part: partId(part), parent: attach ? { ...attach } : null }
		]
	};
}

/** Indices of `index` and everything attached below it. */
export function subtreeOf(design: VesselDesign, index: number): Set<number> {
	const out = new Set<number>([index]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of design.parts) {
			if (p.parent && out.has(p.parent.index) && !out.has(p.index)) {
				out.add(p.index);
				grew = true;
			}
		}
	}
	return out;
}

/** Removes a part together with the parts hanging off it, and drops them from the staging. */
export function removePart(design: VesselDesign, index: number): VesselDesign {
	const gone = subtreeOf(design, index);
	return trimStages({
		...design,
		parts: design.parts.filter((p) => !gone.has(p.index)),
		stages: design.stages.map((s) => s.filter((i) => !gone.has(i)))
	});
}

function trimStages(design: VesselDesign): VesselDesign {
	const stages = design.stages.map((s) => [...s]);
	while (stages.length > 0 && stages[stages.length - 1]!.length === 0) stages.pop();
	return { ...design, stages };
}

/** Puts a part in stage `stage` (0 = the first `stage` command) or in none (`null`). */
export function setPartStage(
	design: VesselDesign,
	index: number,
	stage: number | null
): VesselDesign {
	if (!design.parts.some((p) => p.index === index)) {
		throw new Error(`no part with index ${index} in this design`);
	}
	const stages = design.stages.map((s) => s.filter((i) => i !== index));
	if (stage !== null) {
		if (!Number.isInteger(stage) || stage < 0) throw new RangeError(`bad stage ${stage}`);
		while (stages.length <= stage) stages.push([]);
		stages[stage]!.push(index);
	}
	return trimStages({ ...design, stages });
}

export const stageOf = (design: VesselDesign, index: number): number | null => {
	const k = design.stages.findIndex((s) => s.includes(index));
	return k < 0 ? null : k;
};

/** Nodes of `index`'s part definition that no attachment in the design uses yet. */
export function freeNodes(design: VesselDesign, parts: PartLookup, index: number): string[] {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && parts.get(entry.part);
	if (!entry || !def?.attach) return [];
	const used = new Set<string>();
	for (const p of design.parts) {
		if (p.parent?.index === index) used.add(p.parent.parentNode);
		if (p.index === index && p.parent) used.add(p.parent.node);
	}
	return Object.keys(def.attach).filter((n) => !used.has(n));
}

export function serialiseDesign(design: VesselDesign): string {
	return JSON.stringify(design, null, 2);
}

export type ParseResult = { ok: true; design: VesselDesign } | { ok: false; errors: string[] };

/** Parses and fully validates design JSON (untrusted: file upload or localStorage). */
export function parseDesign(text: string, parts: PartLookup): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { ok: false, errors: [`not valid JSON: ${(error as Error).message}`] };
	}
	const parsed = vesselDesignSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'design'}: ${i.message}`)
		};
	}
	const resolved = resolveVesselDesign(parsed.data, parts);
	return resolved.ok ? { ok: true, design: parsed.data } : { ok: false, errors: resolved.errors };
}

/** The reference vessel, top to bottom: pod, wheel, tank, engine, decoupler, tank, engine. */
export function referenceTwoStage(): VesselDesign {
	const ids = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-small',
		'stock.engine-lv'
	];
	return {
		formatVersion: 1,
		name: 'Two-stage',
		parts: ids.map((part, index) => ({
			index,
			part: partId(part),
			parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
		})),
		stages: [[6], [4, 3]]
	};
}
