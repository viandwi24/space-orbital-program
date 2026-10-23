/**
 * Recovery (ADR 0113 points 4 to 6): the quote a landed vessel shows and the credit when it is
 * recovered. The hardware pays funds by the distance to the nearest home site. With markets open
 * the traded contents (fuel and the like) go to that site's storage instead, scaled the same way,
 * and what does not fit is sold at today's price (system audit D2): fuel bought cheap and recovered
 * no longer pays its static price back.
 */
import {
	ECONOMY_CAUSES,
	greatCircle,
	recoveryQuote,
	sitesOf,
	type EntityId,
	type RecoveryQuote
} from '@orbital/core';
import { normalize } from '@orbital/kepler';
import { rotationAt } from './bodies.ts';
import { vesselOf, type SimCore } from './core.ts';
import {
	RECOVERY_SITES,
	contentsPrice,
	economyOn,
	record,
	strategyFactor,
	vesselHoldings
} from './economy.ts';
import { marketsOpen, storeRecovered, tradedResource } from './market.ts';
import { qConj, qRotate } from './math.ts';
import { multiplierOf } from './strategies.ts';

/** The vessel's position as a body-fixed unit direction, or null when not on the root body. */
function bodyFixedDirection(
	core: SimCore,
	vesselId: EntityId
): { x: number; y: number; z: number } | null {
	const vessel = vesselOf(core, vesselId);
	if (vessel.soi !== core.root.def.id) return null;
	if (vessel.rails?.kind === 'surface') return normalize(vessel.rails.r);
	return normalize(qRotate(qConj(rotationAt(core.root, core.t)), vessel.com));
}

/** The home body's sites as body-fixed unit directions (plan 223): every site recovers. */
function recoverySites(
	core: SimCore
): Array<{ id: string | undefined; dir: { x: number; y: number; z: number } }> {
	const home = core.root.def.id;
	const sites = sitesOf(core.info)
		.filter((s) => s.body === home)
		.map((s) => ({
			id: s.id as string | undefined,
			dir: {
				x: Math.cos(s.latitude) * Math.cos(s.longitude),
				y: Math.sin(s.latitude),
				z: -Math.cos(s.latitude) * Math.sin(s.longitude)
			}
		}));
	return sites.length > 0 ? sites : RECOVERY_SITES.map((dir) => ({ id: undefined, dir }));
}

export function quoteRecovery(core: SimCore, vesselId: EntityId): RecoveryQuote {
	const dir = bodyFixedDirection(core, vesselId);
	const radius = core.root.def.radius;
	const sites = recoverySites(core);
	let nearest: string | undefined = sitesOf(core.info).find((s) => s.body === core.root.def.id)?.id;
	let distance: number | null = null;
	if (dir !== null) {
		for (const s of sites) {
			const d = greatCircle(dir, s.dir, radius);
			if (distance === null || d < distance) {
				distance = d;
				nearest = s.id;
			}
		}
	}
	const { hardware, contents } = vesselHoldings(core, vesselId);
	let value = hardware;
	for (const [r, amount] of contents) value += contentsPrice(core, r, amount);
	const base = recoveryQuote(value, distance, radius);
	const factor = strategyFactor(base.factor, multiplierOf(core, 'recovery'));
	// with markets open the traded contents go to the site's storage, not to funds
	const stored: Array<{ commodity: string; amount: number }> = [];
	let paid = value;
	if (nearest !== undefined && marketsOpen(core)) {
		for (const [r, amount] of contents) {
			const commodity = tradedResource(core, r);
			if (!commodity) continue;
			paid -= contentsPrice(core, r, amount);
			stored.push({ commodity: commodity.id, amount: amount * factor });
		}
	}
	return {
		...base,
		factor,
		credit: paid * factor,
		...(stored.length > 0 ? { stored, site: nearest } : {})
	};
}

/** Credit the recovery (economy on) and return the quote; the caller removes the vessel. */
export function creditRecovery(core: SimCore, vesselId: EntityId): RecoveryQuote {
	const quote = quoteRecovery(core, vesselId);
	if (!economyOn(core)) return quote;
	if (quote.credit > 0) {
		record(core, 'funds', quote.credit, ECONOMY_CAUSES.recovery, `vessel ${vesselId}`);
	}
	for (const s of quote.stored ?? []) storeRecovered(core, quote.site!, s.commodity, s.amount);
	return quote;
}
