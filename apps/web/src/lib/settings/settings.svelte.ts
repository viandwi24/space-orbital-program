/**
 * The live settings (plan 023, extended by plan 053): reactive state over `settings.ts`. `start()`
 * reads the stored value once on the client; every setter persists. Units are applied to the display
 * layer immediately; the key map is derived from the bindings and read by the flight and VAB handlers.
 */
import { setUnitSystem, type UnitSystem } from '../units.svelte';
import {
	createKeymap,
	rebind,
	resetBinding,
	swapBindings,
	type ActionId,
	type Bindings,
	type Keymap,
	type RebindResult
} from '../keybindings';
import {
	DEFAULT_AUDIO,
	defaultSettings,
	loadSettings,
	saveSettings,
	type AudioSettings,
	type Settings,
	type TouchChoice,
	type TutorialProgress
} from './settings';

class SettingsStore {
	units = $state<UnitSystem>('metric');
	tutorial = $state<TutorialProgress>({ status: 'pending', step: 0 });
	bindings = $state.raw<Bindings>({});
	audio = $state<AudioSettings>({ ...DEFAULT_AUDIO });
	touch = $state<TouchChoice>('auto');
	/** Handlers read this; it follows `bindings`. */
	keymap = $derived<Keymap>(createKeymap(this.bindings));
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
		setUnitSystem(settings.units);
	}

	snapshot(): Settings {
		return {
			v: 2,
			units: this.units,
			tutorial: { ...this.tutorial },
			bindings: this.bindings,
			audio: { ...this.audio },
			touch: this.touch
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

	/** Show the tutorial again from the first step. */
	resetTutorial(): void {
		this.setTutorial(defaultSettings().tutorial);
	}

	/** Try to give an action a key; a clash or a reserved key is reported, nothing changes then. */
	rebind(id: ActionId, key: string): RebindResult {
		const result = rebind(this.bindings, id, key);
		if (result.ok) {
			this.bindings = result.bindings;
			this.#save();
		}
		return result;
	}

	/** `id` takes `key` and the action that had it takes `id`'s keys. */
	swap(id: ActionId, key: string): void {
		this.bindings = swapBindings(this.bindings, id, key);
		this.#save();
	}

	resetBinding(id: ActionId): void {
		this.bindings = resetBinding(this.bindings, id);
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
}

export const settings = new SettingsStore();
