/**
 * Build-time settings in the Hangar (plan 218, ADR 0225): a part's controls whose descriptor names a
 * config field (`build`), read from the design part's settings, and the edit that writes one. The
 * edit goes to the whole symmetry group unless "Only this part", as one undo step.
 */
import {
	describeModule,
	parseModuleConfig,
	settingsWith,
	withSettings,
	type EntityId,
	type VesselDesign
} from '@orbital/core';
import type { ControlRow, PartRow } from '../vessel-panel/vessel-model';
import { commitDesign, groupOf, type Content, type EditorState } from './state';

/**
 * The Hangar's row for part `index`: its build controls with the values the design gives them (the
 * module's starting state from the config with the part's settings over it). `entity` is the index.
 */
export function buildRow(
	design: Pick<VesselDesign, 'parts'>,
	content: Content,
	index: number
): PartRow | null {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && content.parts.get(entry.part);
	if (!entry || !def) return null;
	const controls: ControlRow[] = [];
	for (const [moduleId, base] of def.modules ?? []) {
		const mod = content.modules.get(moduleId);
		if (!mod?.describe) continue;
		try {
			const info = describeModule(mod, withSettings(base, entry.settings?.[moduleId]));
			for (const d of info?.actions ?? [])
				if (d.build !== undefined) controls.push({ ...d, enabled: true, module: moduleId });
		} catch {
			// a module whose describe throws offers no settings; the rest go on
		}
	}
	return {
		entity: index as unknown as EntityId,
		title: def.title,
		category: '',
		controls,
		readouts: [],
		resources: [],
		groups: []
	};
}

/**
 * Sets a build control's value on part `index` and, unless `single`, on every part of its symmetry
 * group that has the same module. One undo step; throws (design unchanged) when a module's config
 * would not parse with the new value.
 */
export function setBuildSetting(
	state: EditorState,
	content: Content,
	index: number,
	control: Pick<ControlRow, 'module' | 'build'>,
	value: unknown,
	options: { single?: boolean } = {}
): EditorState {
	if (control.build === undefined) throw new Error('that control has no build setting');
	const members = new Set(options.single ? [index] : groupOf(state.design, index));
	let touched = 0;
	const parts = state.design.parts.map((p) => {
		if (!members.has(p.index)) return p;
		const def = content.parts.get(p.part);
		const base = def?.modules?.find(([id]) => id === control.module);
		const mod = content.modules.get(control.module);
		if (!base || !mod) return p;
		const own = settingsWith(base[1], p.settings?.[control.module], control.build!, value);
		const parsed = parseModuleConfig(mod, withSettings(base[1], own));
		if (!parsed.ok) throw new Error(parsed.message);
		touched += 1;
		return { ...p, settings: { ...(p.settings ?? {}), [control.module]: own } };
	});
	if (touched === 0) throw new Error(`no part ${index} with ${control.module}`);
	return commitDesign(state, content, { ...state.design, parts });
}
