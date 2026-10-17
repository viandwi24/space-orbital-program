/**
 * Worlds in the web client (plan 087, ADRs 0094, 0111, 0141 and 0143), the pure part: the rule form of
 * Create World generated from the registries, the world info it produces, Duplicate, and the
 * catch-up offer. No storage and no DOM here; `worlds.ts` and the screens use these.
 */
import {
	epochFromUnixMs,
	epochFromUtc,
	formatDate,
	LEGACY_SITE,
	presetValue,
	resolveSiteTemplate,
	siteConsequences,
	worldInfoSchema,
	type BodyDefinition,
	type SiteConsequences,
	type SiteTemplateDefinition,
	type Calendar,
	type Command,
	type Epoch,
	type PresetDefinition,
	type RuleDefinition,
	type RuleValue,
	type WorldInfo
} from '@orbital/core';

/** What the form reads: the registries' rules and presets (`registries.rules`, `registries.presets`). */
export interface RuleCatalog {
	rules: readonly RuleDefinition[];
	presets: readonly PresetDefinition[];
}

/** A category of the form and its rules, in registration order. */
export interface RuleGroup {
	category: string;
	rules: readonly RuleDefinition[];
}

/** The rules grouped by category, in the order the categories first appear. */
export function ruleGroups(catalog: RuleCatalog): RuleGroup[] {
	const groups = new Map<string, RuleDefinition[]>();
	for (const rule of catalog.rules) {
		const list = groups.get(rule.category) ?? [];
		list.push(rule);
		groups.set(rule.category, list);
	}
	return [...groups].map(([category, rules]) => ({ category, rules }));
}

/** An identity rule is fixed for the world's life (`changeable: false`); the form marks it. */
export const isIdentityRule = (rule: RuleDefinition): boolean => !rule.changeable;

/** Every rule's value in a preset (the preset's own values, else the rule's per-preset value, else its default). */
export function presetRules(catalog: RuleCatalog, presetId: string): Record<string, RuleValue> {
	const preset = catalog.presets.find((p) => p.id === presetId);
	return Object.fromEntries(catalog.rules.map((r) => [r.id, presetValue(r, preset, presetId)]));
}

/** True when the values differ from the preset's: the form shows the preset as "Custom". */
export function isCustom(
	catalog: RuleCatalog,
	presetId: string,
	values: Readonly<Record<string, RuleValue>>
): boolean {
	const base = presetRules(catalog, presetId);
	return catalog.rules.some((r) => values[r.id] !== undefined && values[r.id] !== base[r.id]);
}

/** The start date choices (ADR 0143 point 4). */
export type StartDate =
	| { kind: 'day-one' }
	| { kind: 'today' }
	| { kind: 'fixed'; year: number; month: number; day: number }
	| { kind: 'j2000' };

/** Which start dates a calendar allows: a real date only on the Gregorian calendar. */
export const startDatesFor = (calendar: Calendar): readonly StartDate['kind'][] =>
	calendar.kind === 'gregorian-utc' ? ['today', 'fixed', 'j2000'] : ['day-one'];

/** The epoch of a start date; `nowMs` is the host clock, read once (ADR 0103 point 2). */
export function startEpoch(start: StartDate, nowMs: number): Epoch {
	switch (start.kind) {
		case 'day-one':
		case 'j2000':
			return { day: 0, fraction: 0 };
		case 'today':
			return epochFromUnixMs(nowMs);
		case 'fixed':
			return epochFromUtc({
				year: start.year,
				month: start.month,
				day: start.day,
				hour: 0,
				minute: 0,
				second: 0
			});
	}
}

/** What the Create World form submits. Plain data: a forged value is caught by `createWorldInfo`. */
export interface CreateWorldInput {
	id: string;
	seed: number;
	preset: string;
	rules: Record<string, RuleValue>;
	start: StartDate;
	/** `patched` only; `n-body` is shown "Coming soon" and refused here. */
	gravityModel: string;
	systemId: string;
	systemVersion: string;
	variant: string;
	/** The primary site (plan 092): absent = the Legacy site at 0°, 0°. */
	site?: { latitude: number; longitude: number; template?: string };
}

/** A resolved template for Create World (ADR 0177 point 5): the spot, what was relaxed, its consequences. */
export interface SiteChoice {
	template: string;
	latitude: number;
	longitude: number;
	relaxed: string[];
	consequences: SiteConsequences;
}

/** The home body of a body list: the one without a parent. */
const homeOf = (bodies: readonly BodyDefinition[]): BodyDefinition | undefined =>
	bodies.find((b) => !b.parent);

/**
 * Resolves `templateId` on a new world of `seed` (its terrain seed is the world seed, ADR 0142
 * point 2), or null when the template or the home body is missing.
 */
export function resolveSiteChoice(
	catalog: { siteTemplates: readonly SiteTemplateDefinition[]; bodies: readonly BodyDefinition[] },
	templateId: string,
	seed: number
): SiteChoice | null {
	const template = catalog.siteTemplates.find((t) => t.id === templateId);
	const home = homeOf(catalog.bodies);
	if (!template || !home) return null;
	const spot = resolveSiteTemplate(template, { seed, radius: home.radius });
	return {
		template: template.id,
		latitude: spot.latitude,
		longitude: spot.longitude,
		relaxed: [...spot.relaxed],
		consequences: siteConsequences(spot, home, seed)
	};
}

/** `21.4° N, 3.0° W`: a site's place for people. */
export function formatLatLon(latitude: number, longitude: number): string {
	const deg = (x: number) => (Math.abs(x) * 180) / Math.PI;
	return `${deg(latitude).toFixed(1)}° ${latitude >= 0 ? 'N' : 'S'}, ${deg(longitude).toFixed(1)}° ${longitude >= 0 ? 'E' : 'W'}`;
}

export type CreateWorldResult = { ok: true; world: WorldInfo } | { ok: false; reason: string };

/**
 * The world info of a new world, validated like a save's (`worldInfoSchema`: n-body refused) and
 * with every rule checked against its definition.
 */
export function createWorldInfo(
	input: CreateWorldInput,
	catalog: RuleCatalog,
	calendar: Calendar,
	nowMs: number
): CreateWorldResult {
	if (!catalog.presets.some((p) => p.id === input.preset)) {
		return { ok: false, reason: `unknown preset "${input.preset}"` };
	}
	if (!startDatesFor(calendar).includes(input.start.kind)) {
		return { ok: false, reason: 'this star system has its own calendar: worlds start on day 1' };
	}
	const rules = { ...presetRules(catalog, input.preset), ...input.rules };
	const parsed = worldInfoSchema.safeParse({
		id: input.id,
		seed: input.seed,
		systemId: input.systemId,
		systemVersion: input.systemVersion,
		variant: input.variant,
		gravityModel: input.gravityModel,
		epoch: startEpoch(input.start, nowMs),
		rules,
		// The chosen site becomes the Space Center with the Legacy pad and layout; none = the Legacy site.
		sites: input.site
			? [
					{
						...structuredClone(LEGACY_SITE),
						id: 'space-center',
						latitude: input.site.latitude,
						longitude: input.site.longitude
					}
				]
			: [],
		preset: input.preset,
		changelog: []
	});
	if (!parsed.success) {
		return { ok: false, reason: parsed.error.issues.map((i) => i.message).join('; ') };
	}
	return { ok: true, world: parsed.data };
}

/** Duplicate (ADR 0143): a new id, the same rules and start, optionally a new seed; no changelog. */
export function duplicateWorldInfo(world: WorldInfo, id: string, seed = world.seed): WorldInfo {
	return { ...structuredClone(world), id, seed, changelog: [] };
}

// --- catch-up (ADR 0103 point 3, ADR 0143 point 4) --------------------------------------------

/** What the catch-up control shows. */
export type CatchUp =
	| { kind: 'none' }
	| { kind: 'offer'; time: number; behindSeconds: number; date: string }
	| { kind: 'unavailable'; reason: string; behindSeconds: number };

/** Behind the real date by less than this, nothing is offered (a minute of reading the screen). */
export const CATCH_UP_MIN_SECONDS = 60;

/**
 * Whether a world at sim time `t` is behind the real date `nowMs`, and if so the sim time of the
 * real date. Only on a Gregorian calendar (a fictional one has no real date); only when every vessel
 * is on rails (`warp-to` needs it), never backwards.
 */
export function catchUpOffer(
	epoch: Epoch,
	calendar: Calendar,
	snapshot: { t: number; vessels: readonly { name: string; mode: 'flight' | 'on-rails' }[] },
	nowMs: number
): CatchUp {
	if (calendar.kind !== 'gregorian-utc') return { kind: 'none' };
	const real = epochFromUnixMs(nowMs);
	// sim time of the real date: whole days and fractions apart, in seconds (never one big float sum)
	// rounded to the millisecond: the clock has no finer resolution, and day fractions carry float error
	const time =
		Math.round(
			((real.day - epoch.day) * 86_400 + (real.fraction - epoch.fraction) * 86_400) * 1000
		) / 1000;
	const behindSeconds = time - snapshot.t;
	if (behindSeconds < CATCH_UP_MIN_SECONDS) return { kind: 'none' };
	const flying = snapshot.vessels.find((v) => v.mode === 'flight');
	if (flying) {
		return {
			kind: 'unavailable',
			behindSeconds,
			reason: `"${flying.name}" is in flight; time warp needs every vessel on rails.`
		};
	}
	return { kind: 'offer', time, behindSeconds, date: formatDate(calendar, epoch, time).text };
}

/** The command that accepts an offer: warp to the real date at the highest rate. */
export const catchUpCommand = (offer: Extract<CatchUp, { kind: 'offer' }>): Command => ({
	type: 'warp-to',
	time: offer.time,
	factor: 1_000_000
});

/** "40 days", "3 h 20 min": how far behind, for the offer's text. */
export function behindText(seconds: number): string {
	const days = Math.floor(seconds / 86_400);
	if (days >= 2) return `${days} days`;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds - h * 3600) / 60);
	return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
