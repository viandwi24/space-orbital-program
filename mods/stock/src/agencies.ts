/**
 * Stock rival agencies (plan 126, ADR 0190): six fictional agencies with their own temper and a
 * short programme of satellites and relays over the home world. A world runs the first
 * `stock.agency-count` of them. Their objects fly high (900 km and up), so a crowded sky does not
 * shorten every time-warp chunk.
 */
import { defineAgency } from '@orbital/sdk';

const sat = (id: string, altitude: number, cost: number, prepDays: number) => ({
	id,
	kind: 'satellite' as const,
	altitude,
	cost,
	success: 0.9,
	prepDays,
	lifeDays: 720
});
const relay = (id: string, altitude: number, cost: number, prepDays: number, rent: number) => ({
	id,
	kind: 'relay' as const,
	altitude,
	cost,
	success: 0.85,
	prepDays,
	lifeDays: 900,
	rent
});

export const AgencyMeridian = defineAgency({
	id: 'stock.meridian',
	name: 'Meridian Space Authority',
	personality: { aggressiveness: 0.6, risk: 0.3 },
	budget: { start: 120_000, monthly: 30_000 },
	programme: [
		relay('meridian-relay', 2_400_000, 60_000, 40, 400),
		sat('meridian-weather', 1_200_000, 45_000, 50)
	]
});
export const AgencyAurora = defineAgency({
	id: 'stock.aurora',
	name: 'Aurora Orbital',
	personality: { aggressiveness: 0.8, risk: 0.6 },
	budget: { start: 80_000, monthly: 26_000 },
	programme: [
		sat('aurora-imager', 950_000, 35_000, 35),
		relay('aurora-relay', 3_000_000, 70_000, 55, 300)
	]
});
export const AgencyKestrel = defineAgency({
	id: 'stock.kestrel',
	name: 'Kestrel Launch Works',
	personality: { aggressiveness: 0.4, risk: 0.2 },
	budget: { start: 100_000, monthly: 22_000 },
	programme: [
		relay('kestrel-relay', 1_800_000, 55_000, 60, 350),
		sat('kestrel-survey', 1_400_000, 40_000, 70)
	]
});
export const AgencyTidewater = defineAgency({
	id: 'stock.tidewater',
	name: 'Tidewater Aerospace',
	personality: { aggressiveness: 0.5, risk: 0.4 },
	budget: { start: 90_000, monthly: 24_000 },
	programme: [
		sat('tidewater-comsat', 1_100_000, 42_000, 45),
		relay('tidewater-relay', 2_800_000, 65_000, 50, 380)
	]
});
export const AgencyHalcyon = defineAgency({
	id: 'stock.halcyon',
	name: 'Halcyon Institute',
	personality: { aggressiveness: 0.3, risk: 0.1 },
	budget: { start: 150_000, monthly: 18_000 },
	programme: [sat('halcyon-observatory', 1_600_000, 50_000, 80)]
});
export const AgencyBasalt = defineAgency({
	id: 'stock.basalt',
	name: 'Basalt Dynamics',
	personality: { aggressiveness: 0.9, risk: 0.7 },
	budget: { start: 60_000, monthly: 28_000 },
	programme: [
		relay('basalt-relay', 2_000_000, 50_000, 30, 250),
		sat('basalt-ranger', 900_000, 30_000, 30)
	]
});

export const STOCK_AGENCIES = [
	AgencyMeridian,
	AgencyAurora,
	AgencyKestrel,
	AgencyTidewater,
	AgencyHalcyon,
	AgencyBasalt
] as const;
