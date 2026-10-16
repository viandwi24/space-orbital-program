<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Icon from '../ui/Icon.svelte';
	import { MAX_NAME_LENGTH } from './saves';
	import type { SaveController } from './save-controller.svelte';

	let { saves, suggestion = 'Saved flight' }: { saves: SaveController; suggestion?: string } =
		$props();

	let name = $state('');
	$effect(() => {
		if (saves.saveOpen) name = suggestion;
	});
</script>

<Dialog open={saves.saveOpen} title="Save this flight" onclose={() => (saves.saveOpen = false)}>
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			void saves.saveAs(name);
		}}
	>
		<label>
			<span>Name</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input bind:value={name} maxlength={MAX_NAME_LENGTH} autofocus />
		</label>
		<p class="dim">F5 quicksaves, F9 loads the quicksave. The game also saves by itself.</p>
		{#if saves.note && saves.noteIsError}
			<p class="note error" role="alert"><Icon name="alert" size={16} /> {saves.note}</p>
		{/if}
		<div class="foot">
			<Button onclick={() => (saves.saveOpen = false)}>Cancel</Button>
			<Button variant="primary" type="submit" disabled={saves.busy}>Save</Button>
		</div>
	</form>
</Dialog>

<style>
	.form {
		display: grid;
		gap: var(--s-3);
		min-width: min(420px, calc(100vw - 80px));
	}
	label {
		display: grid;
		gap: var(--s-1);
		font-size: var(--t-sm);
	}
	input {
		height: 36px;
		padding: 0 var(--s-3);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		font: inherit;
	}
	input:focus {
		border-color: var(--c-accent);
		outline: none;
	}
	.dim {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.note {
		display: flex;
		gap: var(--s-2);
		align-items: center;
		margin: 0;
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
		border: 1px solid var(--c-danger);
		border-radius: var(--r-panel);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-3);
	}
</style>
