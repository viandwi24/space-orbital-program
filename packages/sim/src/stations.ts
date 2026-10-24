/**
 * Deployed science stations (plan 284, ADR 0264): station items set on the ground are vessels of
 * one part (`stock.station-item`); the items within `STATION_RANGE` of a control station make one
 * station. Once a day a station with enough power and a link yields each of its science items'
 * experiment.
 */
import { length, sub } from '@orbital/kepler';
import type { EntityId } from '@orbital/core';
import { partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { signalOf } from './comms.ts';
import { motionOf } from './orbit.ts';
import { creditScience, makeResult } from './science.ts';
import { moduleState } from './core.ts';

export const STATION_ITEM = 'stock.station-item';
/** Items this near a control station (m) belong to its station. */
export const STATION_RANGE = 40;
/** The share of its rating a field solar panel gives over a day (night and the angle). */
export const SOLAR_DAY_SHARE = 0.4;

export interface StationItem {
	vessel: EntityId;
	part: EntityId;
	role: 'control' | 'power' | 'antenna' | 'science';
	experiment?: string;
}

/** Every station item standing in the world, by vessel. */
export function stationItems(core: SimCore): StationItem[] {
	const out: StationItem[] = [];
	for (const vesselId of vesselIds(core)) {
		for (const partId of vesselOf(core, vesselId).parts) {
			const mod = partOf(core, partId).modules.find((m) => m.id === STATION_ITEM);
			if (!mod) continue;
			const c = mod.config as { role: StationItem['role']; experiment?: string };
			out.push({
				vessel: vesselId,
				part: partId,
				role: c.role,
				...(c.experiment ? { experiment: c.experiment } : {})
			});
		}
	}
	return out;
}

/** The report of one station: what it has, what it needs, and what it yields. */
export interface StationReport {
	control: EntityId;
	items: StationItem[];
	/** EC/s the station's panels and RTGs give (day-averaged) and its experiments draw. */
	power: { supply: number; demand: number };
	linked: boolean;
	/** Experiments it yields once a day when `working`. */
	experiments: string[];
	working: boolean;
	reason?: string;
}

/** The stations in the world, each round one control item. */
export function stations(core: SimCore): StationReport[] {
	const items = stationItems(core);
	const reports: StationReport[] = [];
	for (const control of items.filter((i) => i.role === 'control')) {
		const here = vesselOf(core, control.vessel);
		const near = items.filter((i) => {
			const other = vesselOf(core, i.vessel);
			return (
				other.soi === here.soi &&
				length(sub(motionOf(core, other).r, motionOf(core, here).r)) <= STATION_RANGE
			);
		});
		let supply = 0;
		let demand = 0;
		const experiments: string[] = [];
		let linked = false;
		for (const i of near) {
			if (i.role === 'power') {
				for (const m of partOf(core, i.part).modules) {
					const power = core.registries.modules.get(m.id)?.power?.(m.config as never);
					if (power) supply += (power.rate ?? 0) * (power.sun ? SOLAR_DAY_SHARE : 1);
				}
			} else if (i.role === 'antenna') {
				const state = moduleState(core, i.part, 'stock.antenna') as
					{ enabled?: boolean } | undefined;
				if (state?.enabled !== false && signalOf(core, i.vessel).connected) linked = true;
			} else if (i.role === 'science' && i.experiment) {
				const def = core.registries.experiments.get(i.experiment);
				experiments.push(i.experiment);
				demand += def?.power ?? 0;
			}
		}
		const working = experiments.length > 0 && linked && supply + 1e-9 >= demand;
		reports.push({
			control: control.vessel,
			items: near,
			power: { supply, demand },
			linked,
			experiments,
			working,
			...(working
				? {}
				: {
						reason:
							experiments.length === 0
								? 'no experiment'
								: !linked
									? 'no link: it needs an antenna in range'
									: 'not enough power'
					})
		});
	}
	return reports;
}

/** Once a day: each working station yields each of its experiments (a science result, credited). */
export function stationTick(core: SimCore): void {
	for (const report of stations(core)) {
		if (!report.working) continue;
		for (const i of report.items) {
			if (i.role !== 'science' || !i.experiment) continue;
			const result = makeResult(core, i.part, i.experiment);
			if (result) creditScience(core, result.subject, result.value, 'transmitted');
		}
	}
}
