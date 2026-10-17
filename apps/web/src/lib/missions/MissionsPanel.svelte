<script lang="ts">
	/** The mission tracker (plan 100, ADR 0151 point 3): the live checklist and the missions on offer. */
	import Button from '../ui/Button.svelte';
	import Meter from '../ui/Meter.svelte';
	import Panel from '../ui/Panel.svelte';
	import type { TrackerView } from './tracker';

	let { view, onstart }: { view: TrackerView; onstart: (id: string) => void } = $props();
	const pct = (p: number): string => `${Math.round(p * 100)}%`;
</script>

<Panel title="Missions" data-testid="missions-panel">
	{#if view.lastDone}
		<p class="done"><strong>{view.lastDone.title}</strong> {view.lastDone.debriefing}</p>
	{/if}
	{#each view.active as m (m.id)}
		<section class="mission" data-testid="mission-{m.id}">
			<header><span class="name">{m.title}</span><span class="pct">{pct(m.progress)}</span></header>
			<Meter value={m.progress} label="{m.title} progress" />
			<ul>
				{#each m.steps as s, i (i)}
					<li class={s.status}>
						<span class="dot" aria-hidden="true"></span>{s.label}<span class="pct"
							>{s.status === 'done' ? 'Done' : pct(s.progress)}</span
						>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	{#if view.offered.length > 0}
		<h3>On offer</h3>
		{#each view.offered as m (m.id)}
			<section class="mission offered">
				<span class="name">{m.title}</span>
				{#if m.briefing}<p class="brief">{m.briefing}</p>{/if}
				<Button onclick={() => onstart(m.id)} data-testid="mission-start-{m.id}">Start</Button>
			</section>
		{/each}
	{:else if view.active.length === 0}
		<p class="none">No mission running.</p>
	{/if}
</Panel>

<style>
	.mission {
		display: grid;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		margin-bottom: 0.375rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.pct {
		margin-left: auto;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0;
	}
	.dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: var(--text-subtle);
	}
	li.done .dot {
		background: var(--ok);
	}
	li.active .dot {
		background: var(--text-primary);
	}
	h3 {
		margin: 0.5rem 0.25rem 0.375rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.brief,
	.done,
	.none {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.done {
		margin-bottom: 0.5rem;
	}
	.done strong {
		color: var(--ok);
	}
</style>
