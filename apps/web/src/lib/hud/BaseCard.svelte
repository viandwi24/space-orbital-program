<script lang="ts">
	/**
	 * What a landed vessel can do about off-world bases (plan 386, ADR 0125, ADR 0352): found a base
	 * with a kit (asks for a name), join the site it stands in, refuel from the storage of its site.
	 * The offers come from the sim; a refusal shows on the button and a failed command under it.
	 */
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { baseButtons, type BaseButton, type BaseOffers } from './base-model';

	let {
		offers,
		label = (id: string) => id,
		onfound,
		onjoin,
		onrefuel
	}: {
		offers: BaseOffers;
		label?: (id: string) => string;
		onfound: (name: string) => Promise<string | null>;
		onjoin: () => Promise<string | null>;
		onrefuel: () => Promise<string | null>;
	} = $props();

	const buttons = $derived(baseButtons(offers, label));
	let naming = $state(false);
	let name = $state('');
	let note = $state<string | null>(null);

	async function press(b: BaseButton): Promise<void> {
		note = null;
		if (b.id === 'found') {
			naming = true;
			return;
		}
		note = await (b.id === 'join' ? onjoin() : onrefuel());
	}
	async function found(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		note = await onfound(name);
		if (note === null) {
			naming = false;
			name = '';
		}
	}
</script>

<div class="bases" data-testid="base-card">
	{#each buttons as b (b.id)}
		<Button
			variant="primary"
			disabled={b.reason !== undefined}
			data-tip={b.reason}
			data-testid="base-{b.id}"
			onclick={() => void press(b)}>{b.label}</Button
		>
		{#if b.detail}<span class="detail num">{b.detail}</span>{/if}
	{/each}
	{#if note}<p class="note" role="status" data-testid="base-note">{note}</p>{/if}
</div>

<Dialog open={naming} title="Found a base here" onclose={() => (naming = false)}>
	<form onsubmit={found}>
		<p class="facts num">
			{offers.found ? `${label(offers.found.body)}` : ''}: the kit is spent and a flat zone is
			cleared round it.
		</p>
		<input
			type="text"
			aria-label="Base name"
			placeholder="Name the base"
			maxlength="40"
			bind:value={name}
			data-testid="base-name"
		/>
		{#if note}<p class="note" role="status">{note}</p>{/if}
		<div class="actions">
			<Button variant="ghost" type="button" onclick={() => (naming = false)}>Not now</Button>
			<Button variant="primary" type="submit" data-testid="base-found-confirm">Found it</Button>
		</div>
	</form>
</Dialog>

<style>
	.bases {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-start;
	}
	.detail,
	.note,
	.facts {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.note {
		color: var(--text-primary);
	}
	input {
		width: 100%;
		box-sizing: border-box;
		margin: 0.5rem 0 1rem;
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-tile);
		border: 1px solid var(--border-subtle);
		background: var(--surface-tile);
		color: var(--text-primary);
		font: inherit;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
