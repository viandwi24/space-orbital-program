/**
 * Range safety on the page (plan 127, ADR 0155 point 6): the Launch screen's fan and nominal drop
 * estimate, and the HUD's warning from `Snapshot.range`. The sim judges the real drop at staging.
 */
import {
	createBodyTerrainField,
	dropProblem,
	fanWidth,
	hillsSeedOf,
	inFan,
	nominalDrops,
	RANGE_PENALTIES,
	RANGE_RULE,
	resolveRules,
	safeFan,
	sitesOf,
	terrainSeedOf,
	zonesOf,
	type BodyDefinition,
	type FanArc,
	type PresetDefinition,
	type RangeMode,
	type RangeSnapshot,
	type RuleDefinition,
	type Site,
	type WorldInfo
} from '@orbital/core';

interface Lookup<T> {
	get(id: string): T | undefined;
	list(): T[];
}

/** The world's range safety rule (its value, else its preset's). */
export function rangeModeOf(
	info: Pick<WorldInfo, 'rules' | 'preset'>,
	rules: Lookup<RuleDefinition>,
	presets: Lookup<PresetDefinition>
): RangeMode {
	if (!rules.get(RANGE_RULE)) return 'off';
	const v = resolveRules(info.rules, info.preset, rules, presets).values[RANGE_RULE];
	return v === 'cost' || v === 'hard' ? v : 'off';
}

export type DropPlace = 'sea' | 'land' | 'site' | 'orbit';

export interface LaunchRange {
	mode: RangeMode;
	fan: FanArc[];
	/** Width of the fan, degrees. */
	width: number;
	/** The usual eastward ascent lies in the fan. */
	east: boolean;
	drops: Array<{ stage: number; place: DropPlace; site?: string; downrange: number | null }>;
	/** Funds and reputation the estimate would cost under `cost` (before the cost multiplier). */
	penalty: { funds: number; reputation: number };
}

/** The Launch screen panel, or null when the rule is off or the site's body has no water. */
export function launchRange(
	mode: RangeMode,
	site: Site,
	body: BodyDefinition,
	home: boolean,
	info: Pick<WorldInfo, 'id' | 'seed' | 'sites'>,
	stageDeltaV: readonly number[]
): LaunchRange | null {
	if (mode === 'off') return null;
	const field = createBodyTerrainField(body, {
		seed: hillsSeedOf(body, terrainSeedOf(info), home),
		zones: zonesOf(sitesOf(info), body.id)
	});
	const water = field?.waterAt?.bind(field);
	if (!water) return null;
	const sites = sitesOf(info).filter((s) => s.body === body.id);
	const fan = safeFan(
		site,
		body.radius,
		water,
		sites.filter((s) => s.id !== site.id)
	);
	const east = inFan(fan, 90);
	const mu = 6.6743e-11 * body.mass;
	const drops = nominalDrops(
		stageDeltaV,
		{ mu, radius: body.radius, atmosphereHeight: body.atmosphere?.height ?? 0 },
		site
	).map((d) => {
		if (!d.at) return { stage: d.stage, place: 'orbit' as const, downrange: null };
		// the pad itself is not a drop zone the estimate can judge: the stage falls back near it
		const problem = dropProblem(d.at, body.radius, water, sites);
		return {
			stage: d.stage,
			place: !problem ? ('sea' as const) : problem.kind,
			...(problem?.kind === 'site' ? { site: problem.site } : {}),
			downrange: d.downrange
		};
	});
	const penalty = { funds: 0, reputation: 0 };
	const add = (k: keyof typeof RANGE_PENALTIES) => {
		penalty.funds += RANGE_PENALTIES[k].funds;
		penalty.reputation += RANGE_PENALTIES[k].reputation;
	};
	if (!east) add('azimuth');
	for (const d of drops) if (d.place === 'site' || d.place === 'land') add(d.place);
	return { mode, fan, width: fanWidth(fan), east, drops, penalty };
}

/** Fan arcs as text: "45°–120°, 300°–330°", or "none". */
export const fanText = (fan: readonly FanArc[]): string =>
	fan.length === 0 ? 'none' : fan.map((a) => `${a.from}°–${a.to}°`).join(', ');

/** The HUD warning for `vessel`, or null (ADR 0155 point 6). */
export function rangeWarning(range: RangeSnapshot | undefined, vessel: number): string | null {
	const w = range?.warnings.find((x) => x.vessel === vessel);
	if (!range || !w) return null;
	const where = w.kind === 'site' ? `on site "${w.site}"` : 'on land';
	return range.mode === 'hard'
		? `Staging now would drop the spent stage ${where}: refused`
		: `Staging now drops the spent stage ${where}: penalty`;
}
