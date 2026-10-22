<script lang="ts">
	/**
	 * "Start a vessel" (plan 350, ADR 0299): the modal an empty Hangar opens with. Recommended
	 * blueprints, or Build my own, which closes it and points at the parts list with a coach mark.
	 * Escape and a click outside count as Build my own. "Don't show this again" is kept per browser
	 * profile (`orbital.vab.hideStart`).
	 */
	import { loadFlag, saveFlag } from '../storage';
	import type { VabController } from './controller.svelte';

	let {
		vab,
		open,
		onclose,
		featured
	}: {
		vab: VabController;
		open: boolean;
		/** `build`: Build my own (the coach mark shows); `chose`: a blueprint or the Library. */
		onclose: (how: 'build' | 'chose') => void;
		featured: readonly string[];
	} = $props();

	let el = $state<HTMLDialogElement>();
	let hide = $state(loadFlag('hideStart'));
	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		if (!open && el.open) el.close();
	});
	function close(how: 'build' | 'chose'): void {
		saveFlag('hideStart', hide);
		onclose(how);
	}
	const cards = $derived(
		featured.flatMap((id) => {
			const card = vab.blueprints.find((c) => c.id === id);
			return card ? [card] : [];
		})
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={el}
	class="start"
	aria-labelledby="start-title"
	aria-describedby="start-sub"
	data-testid="vab-start"
	oncancel={(e) => {
		e.preventDefault();
		close('build');
	}}
	onclick={(e) => {
		// a click on the backdrop (the dialog itself, outside its box) is Build my own
		if (e.target === el) close('build');
	}}
>
	<div class="box">
		<header>
			<span class="cap">Hangar</span>
			<h2 id="start-title">Start a vessel</h2>
			<p id="start-sub">
				Start from a recommended blueprint, or build your own from scratch with the parts on the
				left. Blueprints are only a head start: you can change every part.
			</p>
		</header>
		<div class="cards" aria-label="Recommended blueprints">
			{#each cards as card (card.id)}
				{@const thumb = open ? vab.blueprintThumbnail(card.id) : null}
				<button
					type="button"
					class="card"
					data-testid="vab-start-{card.id}"
					onclick={() => {
						vab.loadBlueprint(card.id);
						close('chose');
					}}
				>
					<span class="pic">
						{#if thumb}<img src={thumb} alt="" />{/if}
						<span class="badge">Recommended</span>
					</span>
					<strong>{card.title}</strong>
					<span class="sub"
						>{card.inspiredBy ? `Inspired by ${card.inspiredBy}` : card.summary}</span
					>
				</button>
			{/each}
		</div>
		<div class="foot">
			<label class="hide">
				<input type="checkbox" bind:checked={hide} data-testid="vab-start-hide" />
				Don't show this again
			</label>
			<div class="buttons">
				<button
					type="button"
					class="ghost"
					data-testid="vab-open-library"
					onclick={() => {
						close('chose');
						vab.blueprintsOpen = true;
					}}>Open the Library</button
				>
				{#if vab.vesselEntries.length > 0}
					<button
						type="button"
						class="ghost"
						onclick={() => {
							close('chose');
							void vab.openLibrary();
						}}>Open a saved vessel</button
					>
				{/if}
				<button
					type="button"
					class="primary"
					data-testid="vab-build-own"
					onclick={() => close('build')}>Build my own</button
				>
			</div>
		</div>
	</div>
</dialog>

<style>
	dialog.start {
		width: min(52rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 3rem);
		padding: 0;
		border: 1px solid var(--border-subtle);
		border-radius: 1.25rem;
		background: rgb(18 19 22 / 0.94);
		color: var(--text-primary);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.55);
	}
	dialog.start::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.box {
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
		padding: 1.5rem;
	}
	header {
		display: grid;
		gap: 0.5rem;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h2 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 300;
		line-height: 1.1;
	}
	header p {
		margin: 0;
		max-width: 44ch;
		font-size: var(--t-small);
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
		gap: 0.625rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem 0.5rem 0.75rem;
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 0.875rem;
		background: rgb(255 255 255 / 0.035);
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.card:hover,
	.card:focus-visible {
		border-color: rgb(255 255 255 / 0.3);
		background: rgb(255 255 255 / 0.07);
		outline: none;
	}
	.pic {
		position: relative;
		display: grid;
		place-items: center;
		height: 7.5rem;
		border-radius: 0.625rem;
		background-color: #12355e;
		background-image:
			linear-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.08) 1px, transparent 1px);
		background-size: 12px 12px;
		overflow: hidden;
	}
	.pic img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.badge {
		position: absolute;
		left: 0.375rem;
		top: 0.375rem;
		padding: 0.125rem 0.4375rem;
		border-radius: var(--radius-pill);
		background: rgb(0 0 0 / 0.45);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
		color: #fff;
	}
	.card strong {
		padding: 0 0.25rem;
		font-size: var(--t-button);
		font-weight: 600;
	}
	.card .sub {
		padding: 0 0.25rem;
		font-size: var(--t-label);
		line-height: 1.35;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.hide {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.ghost,
	.primary {
		height: 2.5rem;
		padding: 0 1.125rem;
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 700;
		cursor: pointer;
	}
	.ghost {
		border: 1px solid var(--border-subtle);
		background: transparent;
		color: var(--text-primary);
	}
	.ghost:hover {
		background: var(--surface-hover);
	}
	.primary {
		border: 0;
		background: #f4f4f5;
		color: #0b0b0c;
	}
	.primary:hover {
		background: #fff;
	}
	.ghost:focus-visible,
	.primary:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
</style>
