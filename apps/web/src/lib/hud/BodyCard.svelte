<script lang="ts">
	import type { Command, Dossier } from '@orbital/core';
	import Button from '../ui/Button.svelte';

	/**
	 * A body's dossier (plan 104, ADR 0180): unlocked facts, and what unlocks the rest. With discovery
	 * (plan 129) also its facts, data and claims; `oncommand` adds lab processing and a claim form.
	 */
	let { dossier, oncommand }: { dossier: Dossier; oncommand?: (c: Command) => void } = $props();

	/** The claim being drafted per fact: value and confidence in percent. */
	let drafts = $state<Record<string, { value: number; confidence: number }>>({});
	const draft = (fact: string) => (drafts[fact] ??= { value: 0, confidence: 70 });
</script>

<section class="card" data-testid="body-card" aria-label="Dossier">
	<h3>Dossier</h3>
	{#each dossier.entries as entry (entry.id)}
		<div class="entry" class:locked={!entry.unlocked} data-testid="dossier-{entry.fact}">
			<div class="title">{entry.label}</div>
			{#if entry.unlocked}
				<dl>
					{#each entry.lines as line (line.label)}
						<dt>{line.label}</dt>
						<dd>{line.value}</dd>
					{/each}
				</dl>
			{:else}
				<small class="needs">Locked: needs {entry.needs}</small>
			{/if}
		</div>
	{/each}
	{#if dossier.discovery}
		<!-- discovery (plan 129, ADR 0192 point 10): open facts, the best data, claims and verdicts -->
		<div class="entry" data-testid="dossier-discovery">
			<div class="title">Discovery</div>
			<dl>
				{#each dossier.discovery.facts as f (f.fact)}
					<dt>{f.label}</dt>
					<dd data-testid="discovery-fact-{f.fact}">
						{f.status === 'settled' ? f.value : 'open'}{#if f.best}<small>{f.best}</small>{/if}{#if f.processing > 0}<small>{f.processing} in the lab</small>{/if}
					</dd>
					{#if oncommand && f.status === 'open'}
						{@const d = draft(f.fact)}
						<dd class="act" data-testid="discovery-act-{f.fact}">
							{#if f.next}
								<Button
									data-testid="discovery-process-{f.next}"
									onclick={() => oncommand({ type: 'discovery-process', dataset: f.next! })}
									>Process</Button
								>
							{/if}
							<input type="number" min="0" step="any" aria-label="{f.label} value" bind:value={d.value} />
							<select aria-label="{f.label} confidence" bind:value={d.confidence}>
								{#each [50, 60, 70, 80, 90, 95] as p (p)}
									<option value={p}>{p}%</option>
								{/each}
							</select>
							<Button
								data-testid="discovery-claim-{f.fact}"
								onclick={() =>
									oncommand({
										type: 'discovery-claim',
										body: dossier.body,
										fact: f.fact,
										value: d.value,
										confidence: d.confidence / 100
									})}>Claim</Button
							>
						</dd>
					{/if}
				{/each}
			</dl>
			{#if dossier.discovery.claims.length > 0}
				<ul class="claims">
					{#each dossier.discovery.claims as c (c.id)}
						<li data-testid="discovery-claim-{c.id}" class={c.verdict.replace(' ', '-')}>
							{c.label}: {c.value} at {c.confidence} · {c.verdict}{#if c.priority}
								(first){/if}{#if c.reputation !== null}
								· {c.reputation} reputation{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.card {
		margin-top: var(--s-3);
		font-size: var(--t-sm);
	}
	h3 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-dim);
	}
	.entry {
		margin-top: var(--s-2);
	}
	.title {
		color: var(--text);
	}
	.locked .title {
		color: var(--text-dim);
	}
	.needs {
		display: block;
		color: var(--text-dim);
		font-size: var(--t-xs);
		line-height: 1.3;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px var(--s-4);
		margin: 2px 0 0;
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
	}
	dd small {
		display: block;
		color: var(--text-dim);
		font-size: var(--t-xs);
	}
	.act {
		grid-column: 1 / -1;
		display: flex;
		gap: var(--s-1);
		justify-content: flex-end;
	}
	.act input {
		width: 5em;
	}
	.claims {
		margin: var(--s-1) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-xs);
	}
	.claims .accepted {
		color: var(--ok);
	}
	.claims .rejected {
		color: var(--danger);
	}
	.claims .in-review {
		color: var(--text-dim);
	}
</style>
