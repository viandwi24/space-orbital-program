/**
 * The Administration screen's Contracts tab (plan 099, ADR 0186; refs W5 `Admin.dc.html`): the
 * agency strip, Offered / Active / Completed lists and a contract's detail, from `Snapshot.contracts`
 * and `Snapshot.objectives`. Pure: the page renders it and sends the commands.
 */
import {
	CONTRACT_TIER_REPUTATION,
	type Command,
	type ContractsSnapshot,
	type ObjectiveNode,
	type Snapshot
} from '@orbital/core';
import { formatFunds } from '../format';

/** "12,000 funds". */
const money = (x: number): string => `${formatFunds(x)} funds`;
import { bodyLabel } from '../hud-model';

export type ContractTab = 'offered' | 'active' | 'completed';

type Offer = ContractsSnapshot['offers'][number];
type Accepted = ContractsSnapshot['contracts'][number];

export interface ContractRow {
	id: string;
	title: string;
	/** Prestige, 1 to 3 stars. */
	stars: number;
	/** "12,000 funds". */
	reward: string;
	/** "Done", "Failed", "12 days left" or "Expires in 4 days". */
	status: string;
}

export interface AgencyStrip {
	funds: string;
	reputation: string;
	science: string;
	/** "2 of 3 active" or "2 active" without a limit. */
	contracts: string;
}

const funds = (entries: readonly { currency: string; amount: number }[]): number =>
	entries.reduce((s, e) => (e.currency === 'funds' ? s + e.amount : s), 0);
const reputation = (entries: readonly { currency: string; amount: number }[]): number =>
	entries.reduce((s, e) => (e.currency === 'reputation' ? s + e.amount : s), 0);

/** Whole days from `seconds`, rounded up, as words. */
function daysText(seconds: number, day: number): string {
	const n = Math.max(0, Math.ceil(seconds / day));
	return n === 1 ? '1 day' : `${n} days`;
}

export function agencyStrip(snapshot: Pick<Snapshot, 'economy' | 'contracts'> | null): AgencyStrip {
	const e = snapshot?.economy;
	const c = snapshot?.contracts;
	return {
		funds: e ? money(e.funds) : '[—]',
		reputation: e ? String(Math.round(e.reputation)) : '[—]',
		science: e ? String(Math.round(e.science)) : '[—]',
		contracts: c
			? c.slots === null
				? `${c.used} active`
				: `${c.used} of ${c.slots} active`
			: '[—]'
	};
}

/**
 * What an empty Offered list says (player-journey audit Q4, ADR 0325): the reason when it is the
 * agency's reputation, and what brings offers back.
 */
export function emptyOffersText(reputation: number | undefined): string {
	const floor = CONTRACT_TIER_REPUTATION[0];
	if (reputation !== undefined && reputation < floor)
		return `No offers: reputation is ${Math.round(reputation)}, and the first contracts need ${floor} or more. It drifts back toward 0 every month; a mission done raises it.`;
	return 'No offers right now; a new one can come each day.';
}

/** The rows of one tab; `day` is the world-tick day length, s. */
export function contractRows(
	contracts: ContractsSnapshot | undefined,
	tab: ContractTab,
	now: number,
	day: number
): ContractRow[] {
	if (!contracts) return [];
	if (tab === 'offered')
		return contracts.offers.map((o) => ({
			id: o.id,
			title: o.title,
			stars: o.tier,
			reward: money(funds(o.reward)),
			status: `Expires in ${daysText(o.expires - now, day)}`
		}));
	return contracts.contracts
		.filter((c) => (tab === 'active' ? c.status === 'active' : c.status !== 'active'))
		.map((c) => ({
			id: c.id,
			title: c.title,
			stars: c.tier,
			reward: money(funds(c.reward)),
			status:
				c.status === 'done'
					? 'Done'
					: c.status === 'failed'
						? 'Failed'
						: `${daysText(c.deadlineAt - now, day)} left`
		}));
}

export interface ObjectiveLine {
	label: string;
	done: boolean;
}

/** What one leaf asks, in words. */
export function leafText(objective: string, params: Record<string, unknown> | undefined): string {
	const body = typeof params?.['body'] === 'string' ? bodyLabel(params['body']) : null;
	const km = (m: unknown) => `${Math.round(Number(m) / 1000).toLocaleString('en-US')} km`;
	switch (objective) {
		case 'stock.reach-altitude':
			return `Reach ${km(params?.['min'])}${body ? ` above ${body}` : ''}`;
		case 'stock.reach-orbit':
			return `Orbit with periapsis ≥ ${km(params?.['minPeriapsis'])}${
				params?.['maxApoapsis'] !== undefined ? ` and apoapsis ≤ ${km(params['maxApoapsis'])}` : ''
			}`;
		case 'stock.land':
			return `Land${body ? ` on ${body}` : ''}`;
		case 'stock.flyby':
			return `Fly by ${body ?? 'the body'}`;
		case 'stock.enter-soi':
			return `Enter ${body ?? 'the body'}'s sphere of influence`;
		case 'stock.return-home':
			return 'Land back home';
		default:
			return objective;
	}
}

/** The leaves of a tree in order, with their paths. */
function leaves(
	node: ObjectiveNode,
	path = '0'
): Array<{ path: string; objective: string; params?: Record<string, unknown> }> {
	if ('objective' in node)
		return [{ path, objective: node.objective, params: node.params as Record<string, unknown> }];
	const list = 'all' in node ? node.all : 'any' in node ? node.any : node.sequence;
	return list.flatMap((c, i) => leaves(c, `${path}.${i}`));
}

export interface ContractDetail {
	id: string;
	title: string;
	brief: string;
	stars: number;
	objectives: ObjectiveLine[];
	terms: Array<{ label: string; value: string }>;
	/** "Expected value +4,000 funds (estimate: a launch of about 8,000 funds for 1,240 m/s of Δv)". */
	value: string;
	actions: Array<'accept' | 'decline' | 'cancel'>;
	status: 'offered' | 'active' | 'done' | 'failed';
}

/** The detail of an offer or an accepted contract. */
export function contractDetail(
	snapshot: Pick<Snapshot, 'contracts' | 'objectives' | 't'> | null,
	id: string | null,
	day: number
): ContractDetail | null {
	const c = snapshot?.contracts;
	if (!c || !id) return null;
	const offer: Offer | undefined = c.offers.find((o) => o.id === id);
	const accepted: Accepted | undefined = c.contracts.find((x) => x.id === id);
	const item = offer ?? accepted;
	if (!item) return null;
	const inst = accepted ? snapshot.objectives?.find((o) => o.id === accepted.instance) : undefined;
	const status: ContractDetail['status'] = offer ? 'offered' : accepted!.status;
	const repReward = reputation(item.reward);
	const repPenalty = reputation(item.penalty);
	const terms = [
		{ label: 'Advance', value: money(funds(item.advance)) },
		{
			label: 'Reward',
			value: `${money(funds(item.reward))}${repReward ? ` · +${repReward} reputation` : ''}`
		},
		{
			label: 'Penalty',
			value: `${money(funds(item.penalty))}${repPenalty ? ` · ${repPenalty} reputation` : ''}`
		},
		{
			label: 'Deadline',
			value: accepted
				? accepted.status === 'active'
					? `${daysText(accepted.deadlineAt - snapshot.t, day)} left`
					: '[—]'
				: `${daysText(item.deadline, day)} after accepting`
		}
	];
	const sign = item.value >= 0 ? '+' : '−';
	return {
		id: item.id,
		title: item.title,
		brief: item.brief,
		stars: item.tier,
		objectives: leaves(item.objectives).map((l) => ({
			label: leafText(l.objective, l.params),
			done: status === 'done' || inst?.leaves.find((x) => x.path === l.path)?.status === 'done'
		})),
		terms,
		value: `Expected value ${sign}${money(Math.abs(item.value))} (estimate: a launch of about ${money(item.estimate.cost)} for ${Math.round(item.estimate.deltaV).toLocaleString('en-US')} m/s of Δv)`,
		actions: offer ? ['accept', 'decline'] : status === 'active' ? ['cancel'] : [],
		status
	};
}

/** The command of a detail action. */
export function contractCommand(action: 'accept' | 'decline' | 'cancel', id: string): Command {
	if (action === 'accept') return { type: 'contract-accept', offer: id };
	if (action === 'decline') return { type: 'contract-decline', offer: id };
	return { type: 'contract-cancel', contract: id };
}

/** A started objective's name for lists: a generated contract's title, else its source id's label. */
export function objectiveLabel(
	snapshot: Pick<Snapshot, 'contracts'> | null,
	source: { kind: string; id: string }
): string {
	const generated = snapshot?.contracts?.contracts.find((c) => c.id === source.id);
	return generated ? generated.title : bodyLabel(source.id);
}
