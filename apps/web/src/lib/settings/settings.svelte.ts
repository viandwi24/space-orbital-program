/**
 * The live settings (plan 023): reactive state over `settings.ts`. `start()` reads the stored value
 * once on the client; every setter persists. Units are applied to the display layer immediately.
 */
import { setUnitSystem, type UnitSystem } from '../units.svelte';
import {
	defaultSettings,
	loadSettings,
	saveSettings,
	type Settings,
	type TutorialProgress
} from './settings';

class SettingsStore {
	units = $state<UnitSystem>('metric');
	tutorial = $state<TutorialProgress>({ status: 'pending', step: 0 });
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
		setUnitSystem(settings.units);
	}

	snapshot(): Settings {
		return { v: 1, units: this.units, tutorial: { ...this.tutorial } };
	}

	setUnits(units: UnitSystem): void {
		this.units = units;
		setUnitSystem(units);
		saveSettings(this.snapshot());
	}

	setTutorial(progress: TutorialProgress): void {
		this.tutorial = progress;
		saveSettings(this.snapshot());
	}

	/** Show the tutorial again from the first step. */
	resetTutorial(): void {
		this.setTutorial(defaultSettings().tutorial);
	}
}

export const settings = new SettingsStore();
