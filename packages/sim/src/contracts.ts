/**
 * Procedural contracts in the sim (plan 099, ADR 0186): the offer generator on the world tick,
 * accept, decline and cancel, slots from the `mission-control` capacity, the snapshot and the save.
 * An accepted contract is an ordinary objective instance (ADR 0175) whose definition lives here.
 */
import {
	CONTRACT_ADVANCE_CAUSE,
	CONTRACT_COOLDOWN_DAYS,
	CONTRACT_OFFER_CAP,
	CONTRACT_OFFER_DAYS,
	CONTRACT_RULE,
	CONTRACT_TIER_REPUTATION,
	capacityUpgrade,
	createRng,
	estimatedLaunchCost,
	expectedValue,
	leavesOf,
	resolveVesselDesign,
	siteCapacity,
	sitesOf,
	streamSeed,
	type CommandResult,
	type ContractBodyView,
	type ContractDefinition,
	type ContractOffer,
	type ContractTemplateDefinition,
	type ContractsSnapshot,
	type SaveContracts
} from '@orbital/core';
import { hohmannToTarget, toStateVector } from '@orbital/kepler';
import { stateInParent, type BodyRuntime } from './bodies.ts';
import { vesselOf, type SimCore } from './core.ts';
import { strandMember } from './crew.ts';
import { computeRails } from './orbit.ts';
import { spawnVessel } from './vessel.ts';
import { economyOn, record, ruleOf } from './economy.ts';
import { finishObjective, startObjective } from './objectives.ts';
import { multiplierOf } from './strategies.ts';
import { dayLength, hasBackground } from './tick.ts';

export const freshContracts = (core: Pick<SimCore, 'info'>): SaveContracts => ({
	next: 1,
	rng: streamSeed(core.info.seed, 'contracts'),
	offers: [],
	accepted: [],
	cooldowns: []
});

/** Whether the state ever moved from fresh (then it is saved). */
export const contractsTouched = (core: Pick<SimCore, 'info' | 'contracts'>): boolean =>
	core.contracts.next > 1 || core.contracts.rng !== streamSeed(core.info.seed, 'contracts');

/** The generator runs: economy on, and `stock.contracts` not off (ADR 0186 point 2). */
export const contractsOn = (core: SimCore): boolean =>
	economyOn(core) && ruleOf(core, CONTRACT_RULE) !== false;

const GENERATED = /^gen\.\d+$/;

/** An accepted generated contract as a definition, for the objectives engine. */
export function generatedContract(core: SimCore, id: string): ContractDefinition | undefined {
	if (!GENERATED.test(id)) return undefined;
	const c = core.contracts.accepted.find((a) => a.id === id);
	return (
		c && {
			id: c.id,
			title: c.title,
			objectives: c.objectives,
			reward: c.reward,
			penalty: c.penalty,
			deadline: c.deadline
		}
	);
}

const labelOf = (id: string): string => {
	const name = id.slice(id.lastIndexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
};

const bodyView = (b: BodyRuntime): ContractBodyView => ({
	id: b.def.id,
	label: labelOf(b.def.id),
	parent: b.parent?.def.id ?? null,
	radius: b.def.radius,
	mu: b.mu,
	a: b.elements?.a ?? 0
});

/** Active contract slots of the primary site; null = no limit (ADR 0186 point 5). */
export function contractSlots(core: SimCore): number | null {
	const site = sitesOf(core.info)[0];
	return site ? siteCapacity(site, core.registries.buildings, 'mission-control') : null;
}

const activeContracts = (core: SimCore) =>
	core.objectives.state.active.filter((a) => a.source.kind === 'contract');

const minReputation = (t: ContractTemplateDefinition): number =>
	t.minReputation ?? CONTRACT_TIER_REPUTATION[t.tier - 1]!;

/**
 * The world tick's contract work (ADR 0186 point 2): expired offers and cooldowns go, then at
 * most one new offer while there are fewer than the cap.
 */
export function contractsTick(core: SimCore, day: number): void {
	if (!contractsOn(core)) return;
	const s = core.contracts;
	s.offers = s.offers.filter((o) => o.expires > core.t);
	s.cooldowns = s.cooldowns.filter((c) => c.until > core.t);
	if (s.offers.length >= CONTRACT_OFFER_CAP) return;
	const reputation = core.economy.balances.reputation;
	const eligible = core.registries.contractTemplates
		.list()
		.filter(
			(t) =>
				reputation >= minReputation(t) &&
				s.offers.filter((o) => o.template === t.id).length < (t.maxOffers ?? 1)
		);
	if (eligible.length === 0) return;
	const rng = createRng(s.rng);
	const total = eligible.reduce((sum, t) => sum + (t.weight ?? 1), 0);
	let pick = rng.next() * total;
	let template = eligible[eligible.length - 1]!;
	for (const t of eligible) {
		pick -= t.weight ?? 1;
		if (pick < 0) {
			template = t;
			break;
		}
	}
	const length = dayLength(core);
	const home = core.root;
	const blueprint = template.generate({
		random: () => rng.next(),
		home: bodyView(home),
		bodies: [...core.bodies.values()].map(bodyView),
		reputation,
		time: core.t,
		day,
		dayLength: length,
		window: (target) => windowTo(core, target),
		milestones: core.milestones.records.map((r) => r.id)
	});
	s.rng = rng.state();
	if (!blueprint) return;
	const taken = (key: string) =>
		s.offers.some((o) => o.key === key) ||
		s.cooldowns.some((c) => c.key === key) ||
		s.accepted.some(
			(a) => a.key === key && activeContracts(core).some((i) => i.source.id === a.id)
		);
	if (taken(blueprint.key)) return;
	// a tree must name registered objectives, or nobody could ever finish it
	const known = leavesOf(blueprint.objectives).every((l) =>
		core.registries.objectives.has(l.objective)
	);
	if (!known) return;
	s.offers.push({
		id: `gen.${s.next++}`,
		template: template.id,
		tier: template.tier,
		key: blueprint.key,
		title: blueprint.title,
		brief: blueprint.brief,
		objectives: blueprint.objectives,
		advance: blueprint.advance,
		reward: blueprint.reward,
		penalty: blueprint.penalty,
		deadline: blueprint.deadline,
		estimate: { deltaV: blueprint.deltaV, cost: estimatedLaunchCost(blueprint.deltaV) },
		offeredAt: core.t,
		expires: core.t + CONTRACT_OFFER_DAYS * length,
		...(blueprint.spawn ? { spawn: blueprint.spawn } : {})
	});
}

/**
 * What an accepted offer makes (plan 231, ADR 0231 point 3): its design on rails in a circular
 * orbit, and with `member` a stranded crew member in its first seat. A reason when it cannot.
 */
function spawnFor(
	core: SimCore,
	offer: ContractOffer
): { vessel: number; member?: string } | string {
	const spawn = offer.spawn!;
	const body = core.bodies.get(spawn.body);
	if (!body) return `this contract needs the body "${spawn.body}"`;
	const resolved = resolveVesselDesign(spawn.design, core.registries.parts);
	if (!resolved.ok) return `this contract's vessel does not build: ${resolved.errors.join('; ')}`;
	const a = body.def.radius + spawn.altitude;
	const state = toStateVector(
		{ a, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: core.t },
		body.mu,
		core.t
	);
	const id = spawnVessel(core, spawn.design, resolved);
	const vessel = vesselOf(core, id);
	vessel.soi = body.def.id;
	vessel.com = { ...state.r };
	vessel.velocity = { ...state.v };
	vessel.rails = computeRails(body.mu, state.r, state.v, core.t, core.info.gravityModel);
	vessel.mode = 'on-rails';
	vessel.launchedAt = core.t;
	if (hasBackground(core, id)) vessel.backgroundAt = core.t;
	const member = spawn.member ? strandMember(core, id) : undefined;
	core.events.emit('vessel:mode-changed', { vessel: id, mode: 'on-rails', reason: 'contract' });
	return { vessel: Number(id), ...(member ? { member } : {}) };
}

/** The next Hohmann window from the home body to a sibling of it (ADR 0186 point 6). */
function windowTo(core: SimCore, target: string) {
	const home = core.root;
	const to = core.bodies.get(target);
	if (!to || !home.parent || to.parent !== home.parent || to === home) return null;
	const plan = hohmannToTarget(
		stateInParent(home, core.t),
		stateInParent(to, core.t),
		home.parent.mu,
		core.t
	);
	return plan ? { departure: plan.time, travel: plan.transferTime } : null;
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** `contract-accept` (ADR 0186 point 4). */
export function acceptContract(core: SimCore, offerId: string): CommandResult {
	const s = core.contracts;
	const offer = s.offers.find((o) => o.id === offerId);
	if (!offer) return refuse(`no contract offer "${offerId}"`);
	const slots = contractSlots(core);
	const used = activeContracts(core).length;
	if (slots !== null && used >= slots) {
		const lift = capacityUpgrade(core.registries.buildings, 'mission-control', used + 1);
		return refuse(`All ${slots} contract slots are in use${lift ? `; ${lift.text}` : ''}`);
	}
	s.offers = s.offers.filter((o) => o !== offer);
	s.accepted.push(offer);
	const started = startObjective(core, { kind: 'contract', id: offer.id }, undefined, true);
	if (!started.ok) {
		s.accepted = s.accepted.filter((a) => a !== offer);
		s.offers.push(offer);
		return started;
	}
	// a rescue's pod and its stranded member come with the contract (plan 231, ADR 0231 point 3)
	if (offer.spawn) {
		const made = spawnFor(core, offer);
		if (typeof made === 'string') return refuse(made);
		offer.spawned = made;
	}
	if (economyOn(core)) {
		// strategies scale a positive advance like the reward (plan 101, ADR 0187 point 1)
		const k = multiplierOf(core, 'contract-funds');
		for (const e of offer.advance) {
			const amount = e.currency === 'funds' && e.amount > 0 ? e.amount * k : e.amount;
			record(core, e.currency, amount, CONTRACT_ADVANCE_CAUSE, offer.id);
		}
	}
	return { ok: true };
}

/** `contract-decline`: the offer goes, its key cools down. */
export function declineContract(core: SimCore, offerId: string): CommandResult {
	const s = core.contracts;
	const offer = s.offers.find((o) => o.id === offerId);
	if (!offer) return refuse(`no contract offer "${offerId}"`);
	s.offers = s.offers.filter((o) => o !== offer);
	const days = core.registries.contractTemplates.get(offer.template)?.cooldownDays;
	s.cooldowns.push({
		key: offer.key,
		until: core.t + (days ?? CONTRACT_COOLDOWN_DAYS) * dayLength(core)
	});
	return { ok: true };
}

/** `contract-cancel`: an active contract fails with its penalty. */
export function cancelContract(core: SimCore, id: string): CommandResult {
	const inst = activeContracts(core).find((a) => a.source.id === id);
	if (!inst) return refuse(`no active contract "${id}"`);
	finishObjective(core, inst, 'failed', 'cancelled');
	return { ok: true };
}

/** `Snapshot.contracts`, or undefined while the generator is off and nothing ever happened. */
export function contractsSnapshot(core: SimCore): ContractsSnapshot | undefined {
	const enabled = contractsOn(core);
	const s = core.contracts;
	if (!enabled && s.offers.length === 0 && s.accepted.length === 0) return undefined;
	const instances = [...core.objectives.state.active, ...core.objectives.state.finished];
	return {
		enabled,
		slots: contractSlots(core),
		used: activeContracts(core).length,
		offers: s.offers.map((o) => ({ ...o, value: expectedValue(o) })),
		contracts: s.accepted.flatMap((c) => {
			const inst = instances.find((i) => i.source.kind === 'contract' && i.source.id === c.id);
			if (!inst) return [];
			return [
				{
					...c,
					value: expectedValue(c),
					instance: inst.id,
					status: inst.status,
					acceptedAt: inst.startedAt,
					deadlineAt: inst.deadline ?? inst.startedAt + c.deadline
				}
			];
		})
	};
}
