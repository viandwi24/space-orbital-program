<script lang="ts">
	import { resolve } from '$app/paths';
	import { GAME_NAME } from '../../../lib/public/about';
	import MenuShell from '../../../lib/ui/MenuShell.svelte';
	import PageHead from '../../../lib/ui/PageHead.svelte';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import { API_VERSION } from '@orbital/sdk';
	import Button from '../../../lib/ui/Button.svelte';
	import Dialog from '../../../lib/ui/Dialog.svelte';
	import Icon from '../../../lib/ui/Icon.svelte';
	import {
		assetLabel,
		dependencyList,
		licenceLabel,
		shortHash,
		sizeLabel,
		sourceLabel,
		statusLabel
	} from '../../../lib/mods/format';
	import { ModManager } from '../../../lib/mods/manager.svelte';
	import ModPatches from '../../../lib/mods/ModPatches.svelte';
	import { openModStore } from '../../../lib/mods/store-idb';

	const manager = new ModManager({
		open: openModStore,
		reload: () => location.assign(resolve('/(world)/mods'))
	});
	let fileInput = $state<HTMLInputElement>();
	let url = $state('');

	onMount(() => void manager.load());

	async function picked(): Promise<void> {
		const file = fileInput?.files?.[0];
		if (file) await manager.inspectFile(file);
		if (fileInput) fileInput.value = '';
	}
</script>

<PageMeta
	title="Mods · {GAME_NAME}"
	description="Install, turn on, turn off and remove {GAME_NAME} mods. A mod is one file; the game asks before it runs anything."
/>

<MenuShell wide>
	<PageHead title="Mods" />
	<p class="lead">
		Mods add parts, modules and bodies. A mod is code: it runs with the same access as this page, so
		install only mods from people you trust. Mod API {API_VERSION}.
	</p>

	{#if manager.volatile}
		<p class="warn" role="status">
			<Icon name="alert" size={16} /> This browser would not keep mods, so they last until you close the
			tab.
		</p>
	{/if}

	{#if manager.changed}
		<div class="banner" role="status">
			<span>Changes apply when the page reloads. Reload before you start a flight.</span>
			<Button variant="primary" onclick={() => manager.reload()}>Reload to apply</Button>
		</div>
	{/if}

	{#if manager.error}
		<p class="error" role="alert"><Icon name="alert" size={16} /> {manager.error}</p>
	{/if}

	<section aria-labelledby="installed">
		<h2 id="installed">Installed</h2>
		{#if manager.loading}
			<p class="dim">Loading…</p>
		{:else if manager.records.length === 0}
			<p class="dim empty">
				No mods installed. Stock parts are always available. Install a package (a
				<code>.orbital-mod.json</code> file) below.
			</p>
		{:else}
			<ul class="mods" aria-label="Installed mods">
				{#each manager.records as record (record.id)}
					{@const status = manager.statusOf(record)}
					<li data-state={status.kind}>
						<div class="main">
							<strong>{record.manifest.title ?? record.id}</strong>
							<span class="num dim"
								>{record.id}
								{record.manifest.version} · licence {licenceLabel(record.manifest)}</span
							>
							{#if record.manifest.description}<span class="dim">{record.manifest.description}</span
								>{/if}
							<span
								class="status"
								class:bad={status.kind === 'failed' || status.kind === 'untrusted'}
							>
								{statusLabel(status)}
							</span>
							{#if status.kind === 'running'}
								<ModPatches patches={manager.patchesOf(record.id)} />
							{/if}
						</div>
						<div class="acts">
							<label class="toggle">
								<input
									type="checkbox"
									checked={record.enabled}
									disabled={manager.busy}
									onchange={(e) => void manager.setEnabled(record.id, e.currentTarget.checked)}
								/>
								Enabled
							</label>
							<Button
								variant="danger"
								disabled={manager.busy}
								aria-label="Remove {record.manifest.title ?? record.id}"
								onclick={() => void manager.remove(record.id)}>Remove</Button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="install">
		<h2 id="install">Install a mod</h2>
		<div class="install">
			<input
				bind:this={fileInput}
				type="file"
				accept=".json,application/json"
				aria-label="Mod package file"
				hidden
				onchange={() => void picked()}
			/>
			<div class="pick">
				<Button onclick={() => fileInput?.click()} disabled={manager.busy}
					><Icon name="open" size={16} /> Choose a mod file</Button
				>
				<span class="dim">or give an address:</span>
			</div>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void manager.inspectUrl(url);
				}}
			>
				<input
					type="url"
					bind:value={url}
					placeholder="https://example.com/my-mod.orbital-mod.json"
					aria-label="Mod package address"
				/>
				<Button type="submit" disabled={manager.busy || url.trim() === ''}>Download</Button>
			</form>
		</div>
		<p class="dim">
			Nothing in a package runs until you confirm. To build your own, read the modding guide in the
			project's repository (<code>docs/guides/writing-a-mod.md</code>).
		</p>
	</section>
</MenuShell>

<Dialog open={manager.pending !== null} title="Install this mod?" onclose={() => manager.cancel()}>
	{#if manager.pending}
		{@const p = manager.pending}
		<div class="prompt">
			<p class="warn">
				<Icon name="alert" size={16} />
				<span>
					<strong>A mod is a program.</strong> If you install it, it runs inside this game with access
					to everything this page can reach: your saves, your designs and the network. Install it only
					if you trust where it came from.
				</span>
			</p>
			<dl>
				<dt>Name</dt>
				<dd>{p.package.manifest.title ?? p.package.manifest.id}</dd>
				<dt>Id and version</dt>
				<dd class="num">{p.package.manifest.id} {p.package.manifest.version}</dd>
				<dt>Author</dt>
				<dd>{p.package.manifest.author ?? 'not stated'}</dd>
				<dt>Licence</dt>
				<dd class="num">{licenceLabel(p.package.manifest)}</dd>
				<dt>Mod API</dt>
				<dd class="num">{p.package.manifest.api}</dd>
				<dt>Needs</dt>
				<dd class="num">{dependencyList(p.package.manifest.dependencies)}</dd>
				<dt>Source</dt>
				<dd class="num">{sourceLabel(p.source)}</dd>
				<dt>Size</dt>
				<dd class="num">{sizeLabel(p.size)}</dd>
				<dt>Also ships</dt>
				<dd>
					{#if p.assets.length === 0}
						no files, only code
					{:else}
						<ul class="files" aria-label="Files in the package">
							{#each p.assets as a (a.path)}
								<li class="num">
									{a.path}: {assetLabel(a)}
								</li>
							{/each}
						</ul>
						<span class="dim">Models are drawn by the game; they cannot run code.</span>
					{/if}
				</dd>
				<dt>Fingerprint</dt>
				<dd class="num" title={p.package.sha256}>{shortHash(p.package.sha256)}</dd>
			</dl>
			{#if p.package.manifest.description}<p class="dim">{p.package.manifest.description}</p>{/if}
			{#if p.replaces}
				<p class="dim">
					This replaces version {p.replaces.manifest.version} of the same mod.
				</p>
			{/if}
			<div class="foot">
				<Button onclick={() => manager.cancel()}>Cancel</Button>
				<Button variant="primary" disabled={manager.busy} onclick={() => void manager.confirm()}
					>Trust and install</Button
				>
			</div>
		</div>
	{/if}
</Dialog>

<style>
	.pick {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	h2 {
		margin: var(--s-6) 0 var(--s-3);
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.lead,
	.dim {
		color: var(--text-dim);
	}
	.files {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.mods {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-3);
	}
	.mods li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-4);
		padding: var(--s-4);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-card);
	}
	.main {
		display: grid;
		gap: var(--s-1);
		min-width: 0;
	}
	.status {
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.status.bad,
	.error {
		color: var(--danger);
	}
	.acts {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-shrink: 0;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
	.banner,
	.warn {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4);
		background: var(--surface-inset);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-card);
	}
	.banner {
		justify-content: space-between;
		margin: var(--s-4) 0;
	}
	.install {
		display: grid;
		gap: var(--s-3);
	}
	.install form {
		display: flex;
		gap: var(--s-3);
	}
	.install input[type='url'] {
		flex: 1;
		min-height: var(--round-btn);
		padding: 0 var(--s-3);
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.prompt {
		display: grid;
		gap: var(--s-3);
		max-width: 34rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--s-1) var(--s-4);
		margin: 0;
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-3);
	}
	.warn :global(svg) {
		flex-shrink: 0;
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
</style>
