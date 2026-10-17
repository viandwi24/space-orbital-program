/**
 * Evaluating a panel view (plan 112, ADR 0149 points 3 and 5): selectors run against the panel
 * input and give a plain tree the page draws; anything that throws marks the panel as failed and
 * nothing else. Sparkline values are kept per panel between updates.
 */
import type { Command, PanelDefinition, PanelInput, PanelNode } from '@orbital/core';

export type ShownNode =
	| { kind: 'section'; title?: string; children: ShownNode[] }
	| { kind: 'readout'; label: string; value: string | null; unit?: string }
	| { kind: 'meter'; label: string; value: number | null }
	| { kind: 'switch'; label: string; on: boolean; path: string }
	| { kind: 'button'; label: string; enabled: boolean; path: string }
	| { kind: 'list'; label?: string; items: { name: string; value?: string }[] }
	| { kind: 'sparkline'; label: string; values: number[]; last: number | null };

export type PanelResult = { ok: true; nodes: ShownNode } | { ok: false; error: string };

/** Sparkline history by node path, one per panel. */
export type PanelMemory = Map<string, number[]>;

const SAMPLES = 60;

function show(node: PanelNode, input: PanelInput, memory: PanelMemory, path: string): ShownNode {
	switch (node.kind) {
		case 'section':
			return {
				kind: 'section',
				...(node.title === undefined ? {} : { title: node.title }),
				children: node.children.map((c, i) => show(c, input, memory, `${path}.${i}`))
			};
		case 'readout': {
			const v = node.value(input);
			const value =
				v === null || (typeof v === 'number' && !Number.isFinite(v))
					? null
					: typeof v === 'number'
						? v.toLocaleString('en-US', { maximumFractionDigits: 1 })
						: v;
			return {
				kind: 'readout',
				label: node.label,
				value,
				...(node.unit === undefined ? {} : { unit: node.unit })
			};
		}
		case 'meter': {
			const v = node.value(input);
			return {
				kind: 'meter',
				label: node.label,
				value: v === null || !Number.isFinite(v) ? null : Math.min(1, Math.max(0, v))
			};
		}
		case 'switch':
			return { kind: 'switch', label: node.label, on: node.value(input) === true, path };
		case 'button':
			return { kind: 'button', label: node.label, enabled: node.command(input) !== null, path };
		case 'list':
			return {
				kind: 'list',
				...(node.label === undefined ? {} : { label: node.label }),
				items: node.items(input).map((i) => ({
					name: String(i.name),
					...(i.value === undefined ? {} : { value: String(i.value) })
				}))
			};
		case 'sparkline': {
			const v = node.value(input);
			const values = memory.get(path) ?? [];
			if (v !== null && Number.isFinite(v)) {
				values.push(v);
				const keep = node.samples ?? SAMPLES;
				if (values.length > keep) values.splice(0, values.length - keep);
			}
			memory.set(path, values);
			return {
				kind: 'sparkline',
				label: node.label,
				values: [...values],
				last: values.at(-1) ?? null
			};
		}
	}
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function evaluatePanel(
	panel: Pick<PanelDefinition, 'view'>,
	input: PanelInput,
	memory: PanelMemory
): PanelResult {
	try {
		return { ok: true, nodes: show(panel.view, input, memory, 'v') };
	} catch (e) {
		return { ok: false, error: message(e) };
	}
}

/** The node at `path` (`v.0.2`). */
function nodeAt(view: PanelNode, path: string): PanelNode | undefined {
	let node: PanelNode | undefined = view;
	for (const i of path.split('.').slice(1)) {
		node = node?.kind === 'section' ? node.children[Number(i)] : undefined;
	}
	return node;
}

/** The command a button or switch at `path` gives now, or an error to show in the panel. */
export function commandOf(
	panel: Pick<PanelDefinition, 'view'>,
	path: string,
	input: PanelInput,
	on?: boolean
): { command: Command | null } | { error: string } {
	try {
		const node = nodeAt(panel.view, path);
		if (node?.kind === 'button') return { command: node.command(input) };
		if (node?.kind === 'switch') return { command: node.command(input, on ?? !node.value(input)) };
		return { command: null };
	} catch (e) {
		return { error: message(e) };
	}
}
