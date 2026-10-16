<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Icon from '../ui/Icon.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	let fileInput: HTMLInputElement;
	let renaming = $state<string | null>(null);
	let draft = $state('');
	let confirming = $state<string | null>(null);

	const when = (t: number): string =>
		new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	function startRename(id: string, name: string): void {
		renaming = id;
		draft = name;
	}
	async function finishRename(): Promise<void> {
		if (renaming) await vab.renameLibraryEntry(renaming, draft);
		renaming = null;
	}
</script>

<Dialog open={vab.libraryOpen} title="Vessel library" onclose={() => (vab.libraryOpen = false)}>
	<div class="lib">
		{#if vab.libraryVolatile}
			<p class="warn" role="status">
				<Icon name="alert" size={16} /> This browser would not keep the library, so it lasts until you
				close the tab. Export the vessels you want to keep.
			</p>
		{/if}
		{#if vab.vesselEntries.length === 0}
			<p class="dim empty">
				Nothing saved yet. Vessels you build are kept here automatically; open a design file to add
				one.
			</p>
		{:else}
			<ul class="list" aria-label="Saved vessels">
				{#each vab.vesselEntries as e (e.record.id)}
					<li class:current={e.record.id === vab.libraryId} class:damaged={!e.ok}>
						<div class="thumb">
							{#if e.record.thumbnail}
								<img src={e.record.thumbnail} alt="" width="96" height="64" />
							{:else}
								<Icon name="part" size={28} />
							{/if}
						</div>
						<div class="meta">
							{#if renaming === e.record.id}
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
								<strong>{e.record.name}</strong>
							{/if}
							<span class="dim">
								{#if e.ok}
									{e.design.parts.length} parts · {e.design.stages.length}
									{e.design.stages.length === 1 ? 'stage' : 'stages'} ·
								{:else}
									<span class="bad">Damaged: {e.errors[0]}</span> ·
								{/if}
								{when(e.record.updatedAt)}{e.record.id === vab.libraryId ? ' · open now' : ''}
							</span>
						</div>
						<div class="acts">
							<Button disabled={!e.ok} onclick={() => void vab.openEntry(e.record.id)}>Open</Button>
							<button
								type="button"
								class="ic"
								title="Rename"
								aria-label="Rename {e.record.name}"
								onclick={() => startRename(e.record.id, e.record.name)}
							>
								<Icon name="pencil" size={16} />
							</button>
							<button
								type="button"
								class="ic"
								title="Duplicate"
								aria-label="Duplicate {e.record.name}"
								onclick={() => void vab.duplicateLibraryEntry(e.record.id)}
							>
								<Icon name="copy" size={16} />
							</button>
							<button
								type="button"
								class="ic"
								title="Export as a file"
								aria-label="Export {e.record.name} as a file"
								onclick={() => vab.exportLibraryEntry(e.record.id)}
							>
								<Icon name="download" size={16} />
							</button>
							{#if confirming === e.record.id}
								<Button
									variant="danger"
									onclick={() => {
										confirming = null;
										void vab.deleteLibraryEntry(e.record.id);
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
									aria-label="Delete {e.record.name}"
									onclick={() => (confirming = e.record.id)}
								>
									<Icon name="trash" size={16} />
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if vab.libraryNote}<p class="note" role="status">{vab.libraryNote}</p>{/if}

		<div class="foot">
			<Button onclick={() => fileInput.click()}>Import a design file</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				hidden
				onchange={async (e) => {
					const f = e.currentTarget.files?.[0];
					if (f) await vab.importFile(f);
					e.currentTarget.value = '';
				}}
			/>
			<Button variant="primary" onclick={() => (vab.libraryOpen = false)}>Close</Button>
		</div>
	</div>
</Dialog>

<style>
	.lib {
		display: grid;
		gap: var(--s-3);
		min-width: min(620px, calc(100vw - 80px));
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-2);
		max-height: min(52vh, 420px);
		overflow-y: auto;
		scrollbar-width: thin;
	}
	li {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2);
		background: var(--panel-raised);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
	}
	li.current {
		border-color: var(--c-accent);
	}
	li.damaged {
		border-color: var(--c-danger);
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 96px;
		height: 64px;
		color: var(--text-dim);
		background: var(--field);
		border-radius: var(--r-control);
		overflow: hidden;
	}
	.meta {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.meta strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.meta .dim,
	.dim {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.bad {
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
