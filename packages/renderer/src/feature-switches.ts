/**
 * Feature switches for graphics measurement (plan 251, `refs/graphics-performance`): each one takes a
 * `high` extra down to what `medium` draws (or switches it off), so the cost of that one feature is the
 * frame time with it on minus the frame time with it off. A debug tool: nothing in the game reads it.
 *
 * It works by changing the active preset's entry of the settings table in place; the renderer then
 * re-applies the preset (the renderer reads the table at every use, so the change reaches the shadow
 * map, the planet pass, the post chain and the vegetation). Turning a switch off puts back exactly the
 * values it replaced, whatever order the switches are turned on and off in.
 */
import type { GraphicsPreset, PresetSettings } from './presets.ts';

/** The values the switches overwrite: every field of `PresetSettings` is a number or a boolean. */
type Patch = Partial<PresetSettings>;

/**
 * What each switch sets while it is on. Values are `medium`'s, except MSAA and the cloud shadow,
 * which are off and the baked map (what `medium` does) respectively.
 */
export const FEATURE_SWITCHES = {
	/** The 4096 shadow map against 2048. */
	shadowMap: { shadowMapSize: 2048 },
	/** The per-pixel cloud shadow noise (4 octaves) against the baked cloud-shadow map. */
	cloudShadow: { cloudShadowOctaves: 0, cloudShadowMap: true },
	/** The light shafts: steps along the view ray and terrain reads per step. */
	shafts: { shaftSteps: 4, shaftTerrain: 2 },
	/** The cloud march and its detail: erosion octaves, steps and detail level. */
	clouds: { cloudOctaves: 3, cloudSteps: 4, cloudDetail: 2 },
	/** The terrain march: ground octaves, ray steps, refinement and shadow steps, the fine patch. */
	terrain: {
		groundOctaves: 9,
		terrainSteps: 80,
		terrainRefineSteps: 32,
		terrainShadowSteps: 5,
		terrainPatch: 512
	},
	/** The aurora march. */
	aurora: { auroraSteps: 8 },
	/** Grass tufts: 28 000 against 10 000. */
	tufts: { tufts: 10_000 },
	/** Multisampling of the post chain's target: 4 samples against none. */
	msaa: { msaa: 0 }
} as const satisfies Record<string, Patch>;

export type FeatureName = keyof typeof FEATURE_SWITCHES;
export const FEATURE_NAMES = Object.keys(FEATURE_SWITCHES) as FeatureName[];

type Table = Record<GraphicsPreset, PresetSettings>;

/**
 * Applies and reverts the switches on a settings table. `table` is the live one (`PRESETS`, cast
 * mutable); `reapply` is called after every change so the renderer picks the values up.
 */
export class FeatureSwitches {
	/** The first value seen for every field a switch changed, per preset: what turning it off restores. */
	private readonly original = new Map<GraphicsPreset, Patch>();
	/** Switches that are on, per preset. */
	private readonly on = new Map<GraphicsPreset, Set<FeatureName>>();

	constructor(
		private readonly table: Table,
		private readonly reapply: () => void
	) {}

	/** The switches that are on for `preset` (the ones that change what is drawn there). */
	active(preset: GraphicsPreset): FeatureName[] {
		return FEATURE_NAMES.filter((n) => this.on.get(preset)?.has(n));
	}

	set(preset: GraphicsPreset, name: FeatureName, enabled: boolean): void {
		const patch = FEATURE_SWITCHES[name];
		if (!patch) throw new Error(`unknown feature switch "${String(name)}"`);
		const live = this.table[preset] as unknown as Record<string, number | boolean>;
		const set = this.on.get(preset) ?? new Set<FeatureName>();
		const saved = this.original.get(preset) ?? {};
		if (enabled === set.has(name)) return;
		if (enabled) {
			for (const [key, value] of Object.entries(patch)) {
				if (!(key in saved)) (saved as Record<string, unknown>)[key] = live[key];
				live[key] = value as number | boolean;
			}
			set.add(name);
		} else {
			set.delete(name);
			// restore every field this switch owns that no other switch that is still on also sets
			const stillOwned = new Set(
				[...set].flatMap((other) => Object.keys(FEATURE_SWITCHES[other] as Patch))
			);
			for (const key of Object.keys(patch)) {
				if (stillOwned.has(key)) continue;
				live[key] = (saved as Record<string, number | boolean>)[key]!;
				delete (saved as Record<string, unknown>)[key];
			}
		}
		this.on.set(preset, set);
		this.original.set(preset, saved);
		this.reapply();
	}

	/** Every switch off on every preset: the table is what it was. */
	reset(): void {
		for (const [preset, set] of this.on) {
			for (const name of [...set]) this.setQuiet(preset, name);
		}
		this.on.clear();
		this.original.clear();
		this.reapply();
	}

	private setQuiet(preset: GraphicsPreset, name: FeatureName): void {
		const live = this.table[preset] as unknown as Record<string, number | boolean>;
		const saved = this.original.get(preset) ?? {};
		for (const key of Object.keys(FEATURE_SWITCHES[name] as Patch)) {
			if (key in saved) live[key] = (saved as Record<string, number | boolean>)[key]!;
		}
	}
}
