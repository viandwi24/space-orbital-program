/**
 * The new-route form of a site's Flows panel (plan 386, ADR 0125 point 6): a supply route moves an
 * amount of a commodity from one site to another on each transfer window. The sim checks the rest
 * (a flight that has landed on the destination's body, the economy being on); its reason is shown.
 */
import type { Command } from '@orbital/core';

export interface RouteForm {
	from: string;
	to: string;
	commodity: string;
	amount: number;
}

export interface RouteTarget {
	id: string;
	label: string;
}

/** A route id from its ends and what it carries, never one already in use. */
export function routeId(form: RouteForm, taken: readonly string[]): string {
	const slug = (s: string): string =>
		s
			.replace(/^stock\./, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	const base = `${slug(form.from)}-${slug(form.to)}-${slug(form.commodity)}`;
	if (!taken.includes(base)) return base;
	for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** The command for a filled form, or why it cannot be sent yet. */
export function routeCommand(
	form: RouteForm,
	sites: readonly RouteTarget[],
	taken: readonly string[]
): { command: Extract<Command, { type: 'create-route' }> } | { reason: string } {
	if (!sites.some((s) => s.id === form.from)) return { reason: 'choose the site it leaves' };
	if (!sites.some((s) => s.id === form.to)) return { reason: 'choose the site it arrives at' };
	if (form.from === form.to) return { reason: 'a route needs two sites' };
	if (form.commodity === '') return { reason: 'choose what it carries' };
	if (!(form.amount > 0) || !Number.isFinite(form.amount))
		return { reason: 'the amount a window must be more than zero' };
	return {
		command: {
			type: 'create-route',
			id: routeId(form, taken),
			from: form.from,
			to: form.to,
			commodity: form.commodity,
			amount: Math.round(form.amount)
		}
	};
}

/** The line under the form: the fee each window costs, from the launch service's price. */
export function routeFeeLine(fee: number | null): string {
	return fee === null
		? 'Each window moves the amount from the first site to the second.'
		: `Each window moves the amount and costs a launch service fee of ${Math.round(fee).toLocaleString('en-US')}; goods bought on the home planet are paid for too.`;
}
