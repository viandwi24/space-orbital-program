/** The map's filters, remembered between visits (plan 258). */
import {
	MAP_FILTERS_KEY,
	defaultFilters,
	parseFilters,
	serialiseFilters,
	withLayer,
	withType,
	type MapFilters,
	type MapLayer
} from './map-filters';
import type { VesselType } from '@orbital/core';

class MapFilterStore {
	#state = $state.raw<MapFilters>(defaultFilters());
	#loaded = false;

	private load(): void {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			this.#state = parseFilters(globalThis.localStorage?.getItem(MAP_FILTERS_KEY));
		} catch {
			// no storage: the defaults
		}
	}

	get filters(): MapFilters {
		this.load();
		return this.#state;
	}

	private save(next: MapFilters): void {
		this.#state = next;
		try {
			globalThis.localStorage?.setItem(MAP_FILTERS_KEY, serialiseFilters(next));
		} catch {
			// not remembered
		}
	}

	setLayer(layer: MapLayer, on: boolean): void {
		this.save(withLayer(this.filters, layer, on));
	}

	setType(type: VesselType, on: boolean): void {
		this.save(withType(this.filters, type, on));
	}
}

export const mapFilters = new MapFilterStore();
