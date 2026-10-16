<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Icon from '../ui/Icon.svelte';
	import { ago, KIND_LABEL, summaryLine } from './describe';
	import type { SaveController } from './save-controller.svelte';

	let { saves }: { saves: SaveController } = $props();

	let fileInput: HTMLInputElement;
	let renaming = $state<string | null>(null);
	let draft = $state('');
	let confirming = $state<string | null>(null);

	function startRename(id: string, name: string): void {
		renaming = id;
		draft = name;
	}
	async function finishRename(): Promise<void> {
		if (renaming) await saves.rename(renaming, draft);
		renaming = null;
	}
</script>

<Dialog open={saves.loadOpen} title="Load a flight" onclose={() => (saves.loadOpen = false)}>
	<div class="saves">
		{#if saves.volatile}
			<p class="warn" role="status">
				<Icon name="alert" size={16} /> This browser would not keep saves, so they last until you close
				the tab. Export the ones you want to keep.
			</p>
		{/if}
		{#if saves.entries.length === 0}
			<p class="dim empty">
				No saved flights yet. Press F5 in flight to quicksave; the game also saves by itself.
			</p>
		{:else}
			<ul class="list" aria-label="Saved flights">
				{#each saves.entries as e (e.ok ? e.meta.id : e.id)}
					{#if e.ok}
						<li data-kind={e.meta.kind}>
							<div class="thumb">
								{#if e.meta.thumbnail}
									<img src={e.meta.thumbnail} alt="" width="128" height="72" />
								{:else}
									<Icon name="launch" size={28} />
								{/if}
							</div>
							<div class="meta">
								{#if renaming === e.meta.id}
									<form
										onsubmit={(ev) => {
											ev.preventDefault();
											void finishRename();
										}}
									>
										<!-- svelte-ignore a11y_autofocus -->
										<input
											aria-label="New name"
											bind:value={draft}
											maxlength="48"
											autofocus
											onkeydown={(ev) =>
												ev.key === 'Escape' && ((renaming = null), ev.stopPropagation())}
										/>
									</form>
								{:else}
									<strong>{e.meta.name}</strong>
								{/if}
								<span class="dim">{summaryLine(e.meta.summary)}</span>
								<span class="dim"
									><span class="kind">{KIND_LABEL[e.meta.kind]}</span> · {ago(
										e.meta.createdAt,
										saves.now
									)}</span
								>
							</div>
							<div class="acts">
								<Button
									variant="primary"
									disabled={saves.busy}
									onclick={() => void saves.load(e.meta.id)}>Load</Button
								>
								{#if e.meta.kind === 'manual'}
									<button
										type="button"
										class="ic"
										title="Rename"
										aria-label="Rename {e.meta.name}"
										onclick={() => startRename(e.meta.id, e.meta.name)}
									>
										<Icon name="pencil" size={16} />
									</button>
								{/if}
								<button
									type="button"
									class="ic"
									title="Export as a file"
									aria-label="Export {e.meta.name} as a file"
									onclick={() => void saves.exportFile(e.meta.id)}
								>
									<Icon name="download" size={16} />
								</button>
								{#if confirming === e.meta.id}
									<Button
										variant="danger"
										onclick={() => {
											confirming = null;
											void saves.remove(e.meta.id);
										}}>Delete</Button
									>
									<button
										type="button"
										class="ic"
										aria-label="Keep it"
										onclick={() => (confirming = null)}
									>
										<Icon name="close" size={16} />
									</button>
								{:else}
									<button
										type="button"
										class="ic"
										title="Delete"
										aria-label="Delete {e.meta.name}"
										onclick={() => (confirming = e.meta.id)}
									>
										<Icon name="trash" size={16} />
									</button>
								{/if}
							</div>
						</li>
					{:else}
						<li class="damaged">
							<div class="thumb"><Icon name="alert" size={28} /></div>
							<div class="meta">
								<strong>Damaged save</strong>
								<span class="bad">{e.error}</span>
							</div>
							<div class="acts">
								<button
									type="button"
									class="ic"
									title="Delete"
									aria-label="Delete the damaged save"
									onclick={() => void saves.remove(e.id)}
								>
									<Icon name="trash" size={16} />
								</button>
							</div>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}

		{#if saves.modWarning}
			<div class="warn" role="alert">
				<Icon name="alert" size={16} />
				<span>
					This save was made with other versions of
					{saves.modWarning.report.changed
						.map((c) => `${c.id} (${c.saved}, loaded ${c.loaded})`)
						.join(', ')}. It should load, but parts may behave differently.
				</span>
				<Button onclick={() => void saves.load(saves.modWarning!.id, true)}>Load anyway</Button>
			</div>
		{/if}

		{#if saves.note}
			<p class="note" class:error={saves.noteIsError} role="status">
				{saves.note}
				{#if saves.note.includes('mod manager')}<a href="/mods">Mod manager</a>{/if}
			</p>
		{/if}

		<div class="foot">
			<Button onclick={() => fileInput.click()}>Import a save file</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				hidden
				onchange={async (e) => {
					const f = e.currentTarget.files?.[0];
					if (f) await saves.importFile(f);
					e.currentTarget.value = '';
				}}
			/>
			<Button onclick={() => (saves.loadOpen = false)}>Close</Button>
		</div>
	</div>
</Dialog>

<style>
	.saves {
		display: grid;
		gap: var(--s-3);
		min-width: min(640px, calc(100vw - 80px));
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-2);
		max-height: min(52vh, 440px);
		overflow-y: auto;
		scrollbar-width: thin;
	}
	li {
		display: grid;
		grid-template-columns: 128px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2);
		background: var(--panel-raised);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
	}
	li.damaged {
		border-color: var(--c-danger);
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 128px;
		height: 72px;
		color: var(--text-dim);
		background: var(--field);
		border-radius: var(--r-control);
		overflow: hidden;
	}
	.thumb img {
		display: block;
		width: 128px;
		height: 72px;
		object-fit: cover;
	}
	.meta {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.meta strong,
	.meta .dim {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta strong {
		font-weight: 600;
	}
	.dim {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.kind {
		color: var(--c-accent);
	}
	.bad {
		font-size: var(--t-xs);
		color: var(--c-danger);
	}
	.meta input {
		width: 100%;
		height: 30px;
		padding: 0 var(--s-2);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--c-accent);
		border-radius: var(--r-control);
		font: inherit;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.ic {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		color: var(--text-dim);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.ic:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}
	.warn,
	.note {
		display: flex;
		gap: var(--s-2);
		align-items: center;
		margin: 0;
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
		border: 1px solid var(--c-warning);
		border-radius: var(--r-panel);
	}
	.note {
		border-color: var(--line-strong);
	}
	.note.error {
		border-color: var(--c-danger);
	}
	.empty {
		margin: 0;
		padding: var(--s-4);
		text-align: center;
		font-size: var(--t-sm);
	}
	.foot {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
	}
</style>
