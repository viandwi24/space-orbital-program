/**
 * The live settings (plan 023, extended by plan 053): reactive state over `settings.ts`. `start()`
 * reads the stored value once on the client; every setter persists. Units are applied to the display
 * layer immediately; the key map is derived from the bindings and read by the flight and VAB handlers.
 */
import { defaultDock, type DockChoice } from '../dock/dock-model';
import { setUnitSystem, type UnitSystem } from '../units.svelte';
import { applyInterface } from '../ui/root-theme';
import {
	createKeymap,
	rebind,
	resetBinding,
	swapBindings,
	switchProfile,
	DEFAULT_KEY_PROFILE,
	type ActionId,
	type Bindings,
	type KeyProfile,
	type Keymap,
	type RebindResult
} from '../keybindings';
import {
	DEFAULT_AUDIO,
	DEFAULT_INTERFACE,
	defaultSettings,
	defaultTime,
	loadSettings,
	saveSettings,
	type AudioSettings,
	type InterfaceSettings,
	type Settings,
	type TouchChoice,
	type TimeSettings,
	type TutorialProgress,
	type LessonProgress
} from './settings';

class SettingsStore {
	units = $state<UnitSystem>('metric');
	tutorial = $state<TutorialProgress>({ status: 'pending', step: 0 });
	bindings = $state.raw<Bindings>({});
	audio = $state<AudioSettings>({ ...DEFAULT_AUDIO });
	touch = $state<TouchChoice>('auto');
	/** UI scale and high contrast (plan 086), applied to the document root. */
	ui = $state<InterfaceSettings>({ ...DEFAULT_INTERFACE });
	/** The flight dock's rail and open panel (plan 112). */
	dock = $state<DockChoice>(defaultDock());
	/** Debug mode (plan 203, ADR 0213 point 5). */
	debug = $state(false);
	/** Settings → Time (plan 205). */
	time = $state<TimeSettings>(defaultTime());
	/** The key profile under the overrides (plan 216). */
	keyProfile = $state<KeyProfile>(DEFAULT_KEY_PROFILE);
	/** The one-time notice offering the KSP profile is due (plan 216). */
	keyNotice = $state(false);
	/** Lesson progress by lesson id (plan 229). */
	lessons = $state<Record<string, LessonProgress>>({});
	/** Mod keybindings the player changed (plan 343, ADR 0292 point 6). */
	modKeys = $state.raw<Record<string, string[]>>({});
	/** Mod overlays on or off (plan 347, ADR 0296 point 5). */
	overlays = $state.raw<Record<string, boolean>>({});
	/** Handlers read this; it follows `bindings` and the profile. */
	keymap = $derived<Keymap>(createKeymap(this.bindings, this.keyProfile));
	#started = false;

	/** Read the stored settings (once per page load) and apply the units. */
	start(): void {
		if (this.#started) return;
		this.#started = true;
		this.apply(loadSettings());
	}

	apply(settings: Settings): void {
		this.units = settings.units;
		this.tutorial = settings.tutorial;
		this.bindings = settings.bindings;
		this.audio = settings.audio;
		this.touch = settings.touch;
		this.ui = settings.interface;
		this.dock = settings.dock;
		this.debug = settings.debug;
		this.time = settings.time;
		this.keyProfile = settings.keyProfile;
		this.keyNotice = settings.keyNotice;
		this.lessons = settings.lessons;
		this.modKeys = settings.modKeys;
		this.overlays = settings.overlays;
		setUnitSystem(settings.units);
		this.#applyInterface();
	}

	#applyInterface(): void {
		if (typeof document !== 'undefined') applyInterface(document.documentElement, this.ui);
	}

	snapshot(): Settings {
		return {
			v: 4,
			units: this.units,
			tutorial: { ...this.tutorial },
			bindings: this.bindings,
			audio: { ...this.audio },
			touch: this.touch,
			interface: { ...this.ui },
			dock: { ...this.dock, panels: [...this.dock.panels] },
			debug: this.debug,
			time: { ...this.time, places: { ...this.time.places } },
			keyProfile: this.keyProfile,
			keyNotice: this.keyNotice,
			lessons: Object.fromEntries(Object.entries(this.lessons).map(([k, p]) => [k, { ...p }])),
			modKeys: Object.fromEntries(Object.entries(this.modKeys).map(([k, v]) => [k, [...v]])),
			overlays: { ...this.overlays }
		};
	}

	#save(): void {
		saveSettings(this.snapshot());
	}

	setUnits(units: UnitSystem): void {
		this.units = units;
		setUnitSystem(units);
		this.#save();
	}

	setTutorial(progress: TutorialProgress): void {
		this.tutorial = progress;
		this.#save();
	}

	/** Bind a mod keybinding (plan 343): the keys it should have; its defaults drop the override. */
	setModKeys(overrides: Readonly<Record<string, readonly string[]>>): void {
		this.modKeys = Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, [...v]]));
		this.#save();
	}

	/** Turn a mod overlay on or off (plan 347). */
	setOverlay(id: string, on: boolean): void {
		this.overlays = { ...this.overlays, [id]: on };
		this.#save();
	}

	/** A lesson's progress (plan 229). */
	setLesson(id: string, progress: LessonProgress): void {
		this.lessons = { ...this.lessons, [id]: progress };
		this.#save();
	}

	/** Show the tutorial again from the first step. */
	resetTutorial(): void {
		this.setTutorial(defaultSettings().tutorial);
	}

	/** Try to give an action a key; a clash or a reserved key is reported, nothing changes then. */
	rebind(id: ActionId, key: string): RebindResult {
		const result = rebind(this.bindings, id, key, this.keyProfile);
		if (result.ok) {
			this.bindings = result.bindings;
			this.#save();
		}
		return result;
	}

	/** `id` takes `key` and the action that had it takes `id`'s keys. */
	swap(id: ActionId, key: string): void {
		this.bindings = swapBindings(this.bindings, id, key, this.keyProfile);
		this.#save();
	}

	resetBinding(id: ActionId): void {
		this.bindings = resetBinding(this.bindings, id);
		this.#save();
	}

	/** The overrides that would clash in `to`: the player picks "keep mine" or "use profile" for each. */
	profileClashes(to: KeyProfile): ActionId[] {
		return switchProfile(this.bindings, to).clashes;
	}

	/** Switch the key profile, keeping the overrides in `keep` (plan 216); dismisses the notice. */
	setKeyProfile(to: KeyProfile, keep: readonly ActionId[] = []): void {
		this.bindings = switchProfile(this.bindings, to, keep).bindings;
		this.keyProfile = to;
		this.keyNotice = false;
		this.#save();
	}

	dismissKeyNotice(): void {
		this.keyNotice = false;
		this.#save();
	}

	resetAllBindings(): void {
		this.bindings = {};
		this.#save();
	}

	setAudio(patch: Partial<AudioSettings>): void {
		this.audio = { ...this.audio, ...patch };
		this.#save();
	}

	setTouch(choice: TouchChoice): void {
		this.touch = choice;
		this.#save();
	}

	/** Debug mode (plan 203): the flight turns it on in a world that needs it; the world stays marked. */
	setDebug(on: boolean): void {
		this.debug = on;
		this.#save();
	}

	/** Settings → Time (plan 205): a place pause, the hidden-tab policy or the leave-flight prompt. */
	setTime(patch: Partial<TimeSettings>): void {
		this.time = {
			...this.time,
			...patch,
			places: { ...this.time.places, ...(patch.places ?? {}) }
		};
		this.#save();
	}

	/** The dock changed (plan 112): rail and open panel. */
	setDock(dock: DockChoice): void {
		this.dock = dock;
		this.#save();
	}

	setInterface(patch: Partial<InterfaceSettings>): void {
		this.ui = { ...this.ui, ...patch };
		this.#applyInterface();
		this.#save();
	}
}

export const settings = new SettingsStore();
