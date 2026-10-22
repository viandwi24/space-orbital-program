/**
 * Evaluating a panel view (plan 112, ADR 0149 points 3 and 5): selectors run against the panel
 * input and give a plain tree the page draws; anything that throws marks the panel as failed and
 * nothing else. Sparkline values are kept per panel between updates.
 */
import type { Command, PanelDefinition, PanelInput, PanelNode, PanelTone } from '@orbital/core';

export type ShownNode =
	| { kind: 'section'; title?: string; columns: 1 | 2; children: ShownNode[] }
	/** Every tab is evaluated; the host shows one (ADR 0287 point 1). */
	| {
			kind: 'tabs';
			label: string;
			path: string;
			active: string | null;
			tabs: { id: string; label: string; badge: string | null; children: ShownNode[] }[];
	  }
	| { kind: 'progress'; label: string; value: number | null; text: string | null }
	| {
			kind: 'number';
			label: string;
			unit?: string;
			min: number;
			max: number;
			step: number | null;
			value: number | null;
			path: string;
	  }
	| {
			kind: 'notice';
			text: string | null;
			tone: PanelTone;
			/** A button that opens a tab (ADR 0288). */
			action: { label: string; tab: string } | null;
	  }
	| { kind: 'readout'; label: string; value: string | null; unit?: string }
	| { kind: 'meter'; label: string; value: number | null }
	| { kind: 'switch'; label: string; on: boolean; path: string }
	| {
			kind: 'button';
			label: string;
			enabled: boolean;
			path: string;
			tone: 'primary' | 'danger' | null;
	  }
	| {
			kind: 'select';
			label: string;
			options: { value: string; label: string }[];
			value: string | null;
			path: string;
	  }
	| {
			kind: 'list';
			label?: string;
			items: {
				name: string;
				value?: string;
				/** A row's own buttons (plan 231, ADR 0231 point 7): `path` is `<list path>:<row>:<action>`. */
				actions?: { label: string; enabled: boolean; path: string }[];
			}[];
	  }
	| { kind: 'sparkline'; label: string; values: number[]; last: number | null };

/** Svelte context key: the nearest tabs' `open(id)` (ADR 0288). */
export const OPEN_TAB = Symbol('panel-open-tab');

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
				columns: node.columns ?? 2,
				children: node.children.map((c, i) => show(c, input, memory, `${path}.${i}`))
			};
		case 'tabs': {
			const active = node.active?.(input) ?? null;
			return {
				kind: 'tabs',
				label: node.label,
				path,
				active: active !== null && node.tabs.some((t) => t.id === active) ? active : null,
				tabs: node.tabs.map((t, k) => ({
					id: t.id,
					label: t.label,
					badge: t.badge?.(input) ?? null,
					children: t.children.map((c, i) => show(c, input, memory, `${path}.${k}.${i}`))
				}))
			};
		}
		case 'progress': {
			const v = node.value(input);
			return {
				kind: 'progress',
				label: node.label,
				value: v === null || !Number.isFinite(v) ? null : Math.min(1, Math.max(0, v)),
				text: node.text?.(input) ?? null
			};
		}
		case 'number': {
			const v = node.value(input);
			return {
				kind: 'number',
				label: node.label,
				...(node.unit === undefined ? {} : { unit: node.unit }),
				min: node.min,
				max: node.max,
				step: node.step ?? null,
				value: v === null || !Number.isFinite(v) ? null : v,
				path
			};
		}
		case 'notice': {
			const a = node.action?.(input) ?? null;
			return {
				kind: 'notice',
				text: node.text(input),
				tone: node.tone?.(input) ?? 'info',
				action: a ? { label: String(a.label), tab: String(a.tab) } : null
			};
		}
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
			return {
				kind: 'button',
				label: node.label,
				enabled: node.command(input) !== null,
				path,
				tone: node.tone ?? null
			};
		case 'select':
			return {
				kind: 'select',
				label: node.label,
				options: node.options.map((o) => ({ value: o.value, label: o.label })),
				value: node.value(input),
				path
			};
		case 'list':
			return {
				kind: 'list',
				...(node.label === undefined ? {} : { label: node.label }),
				items: node.items(input).map((i, row) => ({
					name: String(i.name),
					...(i.value === undefined ? {} : { value: String(i.value) }),
					...(i.actions && i.actions.length > 0
						? {
								actions: i.actions.map((a, k) => ({
									label: String(a.label),
									enabled: a.command !== null,
									path: `${path}:${row}:${k}`
								}))
							}
						: {})
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

/** The node at `path` (`v.0.2`; inside tabs two steps, the tab and the child: `v.1.0.3`). */
function nodeAt(view: PanelNode, path: string): PanelNode | undefined {
	let node: PanelNode | undefined = view;
	const steps = path.split('.').slice(1);
	for (let k = 0; k < steps.length; k++) {
		const i = Number(steps[k]);
		if (node?.kind === 'section') node = node.children[i];
		else if (node?.kind === 'tabs') node = node.tabs[i]?.children[Number(steps[++k])];
		else node = undefined;
	}
	return node;
}

/** A number field's entry: clamped to its range and rounded to its step. */
export function clampEntry(node: { min: number; max: number; step?: number | null }, v: number): number {
	const stepped = node.step ? Math.round(v / node.step) * node.step : v;
	return Math.min(node.max, Math.max(node.min, Number(stepped.toFixed(9))));
}

/** The command a button or switch at `path` gives now, or an error to show in the panel. */
export function commandOf(
	panel: Pick<PanelDefinition, 'view'>,
	path: string,
	input: PanelInput,
	on?: boolean | string | number
): { command: Command | null } | { error: string } {
	try {
		// a row's button in a list (plan 231): `<list path>:<row>:<action>`, the rows as they are now
		const [at, row, action] = path.split(':');
		if (row !== undefined && action !== undefined) {
			const list = nodeAt(panel.view, at!);
			if (list?.kind !== 'list') return { command: null };
			const a = list.items(input)[Number(row)]?.actions?.[Number(action)];
			return { command: a?.command ?? null };
		}
		const node = nodeAt(panel.view, path);
		if (node?.kind === 'button') return { command: node.command(input) };
		if (node?.kind === 'switch')
			return { command: node.command(input, typeof on === 'boolean' ? on : !node.value(input)) };
		if (node?.kind === 'select' && typeof on === 'string') return { command: node.command(input, on) };
		if (node?.kind === 'number' && typeof on === 'number' && Number.isFinite(on))
			return { command: node.command(input, clampEntry(node, on)) };
		return { command: null };
	} catch (e) {
		return { error: message(e) };
	}
}
