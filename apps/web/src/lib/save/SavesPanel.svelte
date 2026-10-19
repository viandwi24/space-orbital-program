<script lang="ts">
	/**
	 * Settings → Saves (plan 230, ADR 0230): whether the browser keeps the saves through storage
	 * pressure, and every world and save as one backup file, out and back in.
	 */
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';
	import { downloadText } from '../download';
	import { backupFileName, exportBackup, exported, importBackup } from './backup';
	import { loadReminder, saveReminder, storagePersisted } from './backup-state';
	import { openSaveStore, requestSavePersistence } from './open-store';

	let persisted = $state<boolean | null>(null);
	let volatile = $state(false);
	let usage = $state<string | null>(null);
	let note = $state<string | null>(null);
	let busy = $state(false);
	let file = $state<HTMLInputElement>();

	async function refresh(): Promise<void> {
		persisted = await storagePersisted();
		try {
			const e = await navigator.storage?.estimate?.();
			if (e?.usage !== undefined) usage = `${(e.usage / 1_048_576).toFixed(1)} MB used`;
		} catch {
			usage = null;
		}
	}
	onMount(() => {
		void refresh();
		void openSaveStore().then((s) => (volatile = s.volatile));
	});

	async function exportAll(): Promise<void> {
		busy = true;
		try {
			const { store, worlds } = await openSaveStore();
			const now = Date.now();
			const backup = await exportBackup(store, worlds, now);
			downloadText(JSON.stringify(backup), backupFileName(now));
			saveReminder(exported(loadReminder(), now));
			note = `Exported ${backup.worlds.length} worlds and ${backup.saves.length} saves.`;
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function importFile(f: File): Promise<void> {
		busy = true;
		try {
			const { store, worlds } = await openSaveStore();
			const n = await importBackup(await f.text(), store, worlds);
			note = `Imported ${n.worlds} worlds and ${n.saves} saves.`;
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="row" data-testid="saves-storage" data-persisted={String(persisted)}>
	<div class="what">
		<h3>Storage</h3>
		{#if volatile}
			<p class="warn">
				Saves cannot be stored in this browser window: they are lost when it closes.
			</p>
		{:else if persisted}
			<p>
				The browser keeps the saves even when it runs short of space.{usage ? ` ${usage}.` : ''}
			</p>
		{:else}
			<p class="warn" data-testid="saves-not-persistent">
				The browser may delete saves when it runs short of space. Export a backup now and then.{usage
					? ` ${usage}.`
					: ''}
			</p>
		{/if}
	</div>
	{#if !persisted && !volatile}
		<Button
			onclick={async () => {
				await requestSavePersistence();
				await refresh();
			}}>Ask to keep</Button
		>
	{/if}
</div>
<div class="row">
	<div class="what">
		<h3>Backup</h3>
		<p>
			Every world and save in one file; import it here, in another browser or on another computer.
		</p>
	</div>
	<div class="acts">
		<Button onclick={() => void exportAll()} disabled={busy} data-testid="saves-export-all"
			>Export all</Button
		>
		<Button variant="ghost" onclick={() => file?.click()} disabled={busy} data-testid="saves-import"
			>Import</Button
		>
		<input
			bind:this={file}
			type="file"
			accept=".json,application/json"
			hidden
			data-testid="saves-import-file"
			onchange={(e) => {
				const f = e.currentTarget.files?.[0];
				if (f) void importFile(f);
				e.currentTarget.value = '';
			}}
		/>
	</div>
</div>
{#if note}<p class="note" role="status" data-testid="saves-note">{note}</p>{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		padding: var(--s-2) 0;
	}
	h3 {
		margin: 0;
		font-size: var(--t-sm);
		font-weight: 600;
	}
	p {
		margin: 0.25rem 0 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.warn {
		color: var(--c-warning);
	}
	.acts {
		display: flex;
		gap: var(--s-2);
	}
	.note {
		margin-top: var(--s-2);
	}
</style>
