<script lang="ts">
	/**
	 * The selected base's fairing (plan 219, ADR 0224): one row of number fields per section, Add,
	 * Remove, Close, and a status label in text and colour (valid, cannot be made, closed).
	 */
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
	const f = $derived(vab.selectedFairing);
	const status = $derived(
		!f
			? null
			: f.problem
				? { kind: 'bad', text: `Cannot be made: ${f.problem}` }
				: f.closed
					? { kind: 'ok', text: 'Closed: it shields what is inside' }
					: f.sections.length > 0
						? { kind: 'open', text: 'Open: Close it to shield the payload' }
						: { kind: 'open', text: 'No shell yet: add a section' }
	);
	const num = (e: Event): number => Number((e.currentTarget as HTMLInputElement).value);
</script>

{#if f}
	<section class="fairing" aria-label="Fairing" data-testid="fairing-editor">
		<header>
			<h3>Fairing</h3>
			<label class="edit">
				<input type="checkbox" bind:checked={vab.fairingEdit} data-testid="fairing-edit" />
				<span>Edit: a click adds a section</span>
			</label>
		</header>
		<p class="status {status?.kind}" data-testid="fairing-status">
			{status?.text} · {f.mass.toFixed(0)} kg
		</p>
		{#each f.sections as s, i (i)}
			<div class="row" data-testid="fairing-section">
				<span class="dim">{i + 1}</span>
				<label>
					<span class="dim">Height, m</span>
					<input
						type="number"
						step="0.1"
						min="0.1"
						value={s.height}
						aria-label="Section {i + 1} height"
						onchange={(e) => vab.setFairingSection(i, { height: num(e) })}
					/>
				</label>
				<label>
					<span class="dim">Radius, m</span>
					<input
						type="number"
						step="0.05"
						min="0.3"
						value={s.radius}
						aria-label="Section {i + 1} radius"
						onchange={(e) => vab.setFairingSection(i, { radius: num(e) })}
					/>
				</label>
			</div>
		{/each}
		<div class="buttons">
			<button type="button" data-testid="fairing-add" onclick={() => vab.addFairingSection()}
				>Add section</button
			>
			<button
				type="button"
				disabled={f.sections.length === 0}
				data-testid="fairing-remove"
				onclick={() => vab.removeFairingSection()}>Remove last</button
			>
			<button
				type="button"
				disabled={f.sections.length === 0}
				aria-pressed={f.closed}
				data-testid="fairing-close"
				onclick={() => vab.closeFairing(!f.closed)}>{f.closed ? 'Open' : 'Close'}</button
			>
		</div>
	</section>
{/if}

<style>
	.fairing {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.375rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h3 {
		margin: 0;
		font-size: var(--t-small);
	}
	.edit {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--t-label);
	}
	.status {
		margin: 0;
		padding: 0.25rem 0.5rem;
		border-left: 3px solid var(--text-subtle);
		font-size: var(--t-small);
	}
	.status.ok {
		border-left-color: var(--ok);
	}
	.status.open {
		border-left-color: var(--warn);
	}
	.status.bad {
		border-left-color: var(--danger);
	}
	.row {
		display: grid;
		grid-template-columns: 1.25rem 1fr 1fr;
		gap: 0.375rem;
		align-items: end;
	}
	.row label {
		display: grid;
		gap: 0.125rem;
		font-size: var(--t-label);
	}
	input[type='number'] {
		width: 100%;
		min-height: 2rem;
		box-sizing: border-box;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.buttons button {
		min-height: 2.25rem;
		padding: 0 0.625rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border-subtle);
		background: var(--surface-chip);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		cursor: pointer;
	}
	.buttons button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.dim {
		color: var(--text-muted);
	}
</style>
