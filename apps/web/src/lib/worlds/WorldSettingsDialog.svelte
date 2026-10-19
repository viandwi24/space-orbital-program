<script lang="ts">
	/**
	 * World settings during play (plan 230, ADR 0230): every rule of the world with its value. A
	 * rule may only be made easier: the harder choices are closed with the reason, and a rule with no
	 * easier direction is fixed. Each change is a `set-rule`; the changelog lists them, newest first.
	 */
	import type { RuleDefinition, RuleValue, WorldInfo } from '@orbital/core';
	import Dialog from '../ui/Dialog.svelte';
	import Button from '../ui/Button.svelte';
	import { changeableNow, changelogLines, numberRange, ruleOptions } from './rule-changes';

	let {
		open,
		rules,
		values,
		changelog,
		dayLength = 86_400,
		onset,
		onclose,
		note = null
	}: {
		open: boolean;
		rules: readonly RuleDefinition[];
		values: Readonly<Record<string, RuleValue>>;
		changelog: WorldInfo['changelog'];
		dayLength?: number;
		onset: (rule: string, value: RuleValue) => void;
		onclose: () => void;
		/** The sim's answer to the last change, when it was refused. */
		note?: string | null;
	} = $props();

	const shown = $derived(rules.filter((r) => r.changeable));
	const groups = $derived(
		[...new Set(shown.map((r) => r.category))].map((category) => ({
			category,
			rules: shown.filter((r) => r.category === category)
		}))
	);
	const lines = $derived(changelogLines(changelog, rules, dayLength));
	const text = (v: RuleValue) => (v === true ? 'On' : v === false ? 'Off' : String(v));
</script>

<Dialog {open} title="World settings" {onclose}>
	<p class="lead">
		Rules can be made easier while you play, never harder. Every change is kept in the world's
		changelog.
	</p>
	<div class="groups" data-testid="world-settings">
		{#each groups as g (g.category)}
			<section>
				<h3>{g.category}</h3>
				{#each g.rules as rule (rule.id)}
					{@const current = values[rule.id] ?? rule.default}
					<div class="rule">
						<span class="name">{rule.label}</span>
						{#if !changeableNow(rule, current)}
							<span class="fixed" data-testid="ws-fixed-{rule.id}"
								>{text(current)} · {rule.easier === undefined
									? 'fixed once the world is made'
									: 'already the easiest'}</span
							>
						{:else if rule.type === 'number'}
							{@const range = numberRange(rule, Number(current))!}
							<input
								type="number"
								aria-label={rule.label}
								min={range.min}
								max={range.max}
								step={rule.integer ? 1 : 0.1}
								value={Number(current)}
								onchange={(e) => {
									const v = Number(e.currentTarget.value);
									if (Number.isFinite(v) && v !== current) onset(rule.id, v);
								}}
								data-testid="ws-rule-{rule.id}"
							/>
						{:else}
							<select
								aria-label={rule.label}
								value={String(current)}
								onchange={(e) => {
									const raw = e.currentTarget.value;
									onset(rule.id, rule.type === 'boolean' ? raw === 'true' : raw);
								}}
								data-testid="ws-rule-{rule.id}"
							>
								{#each ruleOptions(rule, current) as o (String(o.value))}
									<option
										value={String(o.value)}
										disabled={o.value !== current && o.why !== null}
										title={o.why ?? ''}
										>{o.label}{o.value !== current && o.why ? ' (harder)' : ''}</option
									>
								{/each}
							</select>
						{/if}
					</div>
				{/each}
			</section>
		{/each}
	</div>
	{#if note}<p class="note" role="alert">{note}</p>{/if}
	<section class="log">
		<h3>Changelog</h3>
		{#if lines.length === 0}
			<p class="dim">No rule has changed since the world was made.</p>
		{:else}
			<ul data-testid="world-changelog">
				{#each lines as l, i (i)}<li>{l}</li>{/each}
			</ul>
		{/if}
	</section>
	<div class="foot"><Button variant="primary" onclick={onclose}>Close</Button></div>
</Dialog>

<style>
	.lead,
	.dim {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.groups {
		display: grid;
		gap: var(--s-4);
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		max-height: 50vh;
		overflow: auto;
	}
	h3 {
		margin: 0 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 600;
		text-transform: capitalize;
		color: var(--text-dim);
	}
	.rule {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		padding: 0.25rem 0;
		font-size: var(--t-sm);
	}
	.fixed {
		font-size: var(--t-xs);
		color: var(--text-dim);
		text-align: right;
	}
	select,
	input {
		min-width: 0;
		max-width: 10rem;
		padding: 0.125rem 0.375rem;
		font: inherit;
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.log ul {
		margin: 0;
		padding-left: 1rem;
		font-size: var(--t-sm);
	}
	.log {
		margin-top: var(--s-4);
	}
	.note {
		color: var(--c-warning);
		font-size: var(--t-sm);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-4);
	}
</style>
