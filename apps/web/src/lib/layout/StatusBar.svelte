<script lang="ts">
	/**
	 * The status bar, full width at the bottom (BASE_LAYOUT §4, `Base.dc.html`): world, mode and
	 * system | connection | location; Funds, Science, Reputation and Contracts in the middle;
	 * autosave | mods | the bell. 10 px `#A1A1AA`, values 600 white.
	 */
	import type { Snapshot } from '@orbital/core';
	import { SHELL_ICONS } from './shell-model';
	import { connection, savedAgo, statusItems, type BellFeed } from './status-bar';
	import type { PageLocation } from './page-actions.svelte';
	import { manualText, programRows, programsLabel } from '../programs-model';

	let {
		snapshot,
		focus = null,
		world,
		system,
		location,
		savedAt,
		mods,
		bell,
		onstopprogram
	}: {
		snapshot: Snapshot | null;
		/** The vessel in focus, for its link. */
		focus?: number | null;
		world: { name: string; mode: string };
		/** `Kerbin system`. */
		system: string;
		location: PageLocation;
		savedAt: number | null;
		mods: number;
		bell: BellFeed;
		/** Stop every program on a vessel (plan 315, ADR 0273 point 5). */
		onstopprogram?: (vessel: number) => void;
	} = $props();

	// the programs flying vessels right now (plan 315, ADR 0273 point 8)
	const programs = $derived(programRows(snapshot));
	let programsOpen = $state(false);
	$effect(() => {
		if (programs.length === 0) programsOpen = false;
	});

	const items = $derived(statusItems(snapshot));
	const link = $derived(connection(snapshot, focus));
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	let bellOpen = $state(false);
	let bellVersion = $state(0);
	$effect(() => bell.subscribe(() => (bellVersion += 1)));
	const unread = $derived.by(() => {
		void bellVersion;
		return bell.unread;
	});
	const entries = $derived.by(() => {
		void bellVersion;
		return bell.entries;
	});
	const NONE = '—';
</script>

<footer class="status" aria-label="Status bar" data-testid="status-bar">
	<div class="group g8">
		<span class="world">{world.name}</span>
		<span class="mode">{world.mode.toUpperCase()}</span>
		<span>{system}</span>
	</div>
	<div class="rule" aria-hidden="true"></div>
	<div class="group" data-testid="status-link" data-online={link.online}>
		<span class="dot" class:off={!link.online}></span><b>{link.text}</b><span>{link.detail}</span>
	</div>
	<div class="rule" aria-hidden="true"></div>
	<div class="group" data-testid="status-location">
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linejoin="round"
			stroke-linecap="round"><path d={SHELL_ICONS[location.icon]} /></svg
		>
		<span
			><span data-testid="status-place">{location.text}</span>{#if location.situation}{' · '}<span
					data-testid="hud-phase-text">{location.situation}</span
				>{/if}</span
		>
	</div>
	<div class="centre">
		<span data-testid="hud-funds">Funds <b>{items.funds ?? NONE}</b></span>
		<span data-testid="status-science">Science <b>{items.science ?? NONE}</b></span>
		<span data-testid="status-reputation">Reputation <b>{items.reputation ?? NONE}</b></span>
		<span data-testid="status-contracts">Contracts <b>{items.contracts ?? NONE}</b></span>
	</div>
	<div class="group">
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linejoin="round"><path d={SHELL_ICONS.autosave} /></svg
		>
		<span data-testid="status-saved">{savedAgo(savedAt, now)}</span>
	</div>
	{#if programs.length > 0}
		<div class="rule" aria-hidden="true"></div>
		<button
			type="button"
			class="programs"
			class:manual={programs.some((p) => p.manual.length > 0)}
			data-testid="status-programs"
			aria-expanded={programsOpen}
			data-tip="Programs flying your vessels"
			onclick={() => (programsOpen = !programsOpen)}
		>
			<span class="pulse" aria-hidden="true"></span>{programsLabel(programs.length)}
		</button>
	{/if}
	<div class="rule" aria-hidden="true"></div>
	<div class="group">
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linejoin="round"
			stroke-linecap="round"><path d={SHELL_ICONS.mods} /></svg
		>
		<span data-testid="status-mods">{mods} mod{mods === 1 ? '' : 's'}</span>
	</div>
	<div class="rule" aria-hidden="true"></div>
	<div class="tray">
		<button
			type="button"
			class="bell"
			data-testid="status-bell"
			aria-label="Notifications{unread ? `, ${unread} unread` : ''}"
			aria-expanded={bellOpen}
			data-tip="Notifications"
			onclick={() => {
				bellOpen = !bellOpen;
				if (!bellOpen) bell.markAllRead();
			}}
		>
			<svg
				aria-hidden="true"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.9"
				stroke-linejoin="round"
				stroke-linecap="round"><path d={SHELL_ICONS.bell} /></svg
			>
			{#if unread > 0}<span class="badge" aria-hidden="true">{unread}</span>{/if}
		</button>
	</div>
	{#if programsOpen && programs.length > 0}
		<div class="feed list" role="region" aria-label="Running programs" data-testid="programs-list">
			<p class="head">Programs keep flying when you look away. Touch a control to take it; the program resumes 1 s after you let go. Delete stops the programs of the vessel you fly.</p>
			{#each programs as p (`${p.vessel}-${p.kind}`)}
				<div class="row">
					<div class="what">
						<b>{p.title}</b>
						<span>{p.vesselName} · {p.kind === 'autopilot' ? 'Autopilot' : 'Script'}{p.detail ? ` · ${p.detail}` : ''}</span>
						{#if p.manual.length > 0}<span class="held">Manual: {manualText(p.manual)}</span>{/if}
					</div>
					{#if onstopprogram}
						<button
							type="button"
							class="stop"
							aria-label="Stop the programs of {p.vesselName}"
							onclick={() => onstopprogram(p.vessel)}>Stop</button
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if bellOpen}
		<div class="feed" role="log" aria-label="Notifications" data-testid="bell-feed">
			{#each entries as e (e.id)}
				<p class:unread={!e.read}>{e.text}</p>
			{:else}
				<p>Nothing new.</p>
			{/each}
		</div>
	{/if}
</footer>

<style>
	.status {
		position: fixed;
		z-index: 40;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(2rem + var(--safe-bottom));
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0 calc(1.5rem + var(--safe-right)) var(--safe-bottom) calc(1.5rem + var(--safe-left));
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border-top: 1px solid rgb(255 255 255 / 0.08);
		font-size: 0.625rem;
		line-height: 1;
		color: #a1a1aa;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}
	.group.g8 {
		gap: 0.5rem;
	}
	.group svg {
		width: 0.75rem;
		height: 0.75rem;
		flex: none;
	}
	.world {
		font-size: 0.6875rem;
		font-weight: 700;
		color: #fff;
	}
	.mode {
		height: 1rem;
		padding: 0 0.375rem;
		display: flex;
		align-items: center;
		border-radius: 999px;
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		background: rgb(255 255 255 / 0.1);
		color: #e4e4e7;
	}
	.rule {
		width: 1px;
		height: 0.75rem;
		flex: none;
		background: rgb(255 255 255 / 0.12);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.dot.off {
		background: #ff5a5f;
	}
	b {
		color: #fff;
		font-weight: 600;
	}
	.centre {
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.tray {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-right: -6px;
	}
	.bell {
		position: relative;
		width: 1.625rem;
		height: 1.625rem;
		border: none;
		border-radius: 6px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: #c4c4cc;
		cursor: pointer;
	}
	.bell svg {
		width: 0.875rem;
		height: 0.875rem;
	}
	.bell:hover {
		background: rgb(255 255 255 / 0.06);
	}
	.badge {
		position: absolute;
		right: 1px;
		top: 2px;
		min-width: 12px;
		height: 12px;
		padding: 0 3px;
		box-sizing: border-box;
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.5rem;
		line-height: 1;
		font-weight: 700;
		background: #f4f4f5;
		color: #0b0b0c;
	}
	.feed {
		position: fixed;
		right: 1.5rem;
		bottom: calc(2rem + var(--safe-bottom) + 0.5rem);
		width: min(22rem, calc(100vw - 2rem));
		max-height: 50vh;
		overflow: auto;
		padding: var(--s-2) var(--s-3);
		background: var(--surface-dialog);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		box-shadow: var(--shadow-overlay);
		font-size: var(--t-small);
		line-height: 1.4;
		white-space: normal;
	}
	.feed p {
		margin: var(--s-1) 0;
	}
	.programs {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: 1.375rem;
		padding: 0 0.5rem;
		border: none;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.08);
		color: #fff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.programs:hover {
		background: rgb(255 255 255 / 0.14);
	}
	.pulse {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.programs.manual .pulse {
		background: #f5a524;
	}
	.list {
		right: auto;
		left: 50%;
		transform: translateX(-50%);
		width: min(26rem, calc(100vw - 2rem));
	}
	.list .head {
		color: var(--text-dim);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-2) 0;
		border-top: 1px solid var(--border-subtle);
	}
	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.what span {
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
	.what .held {
		color: #f5a524;
	}
	.stop {
		flex: none;
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-row);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
	}
	.stop:hover {
		background: rgb(255 255 255 / 0.06);
	}
	.feed .unread {
		color: var(--text-primary);
	}
</style>
