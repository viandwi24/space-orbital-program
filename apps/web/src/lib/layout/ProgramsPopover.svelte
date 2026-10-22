<script lang="ts">
	/**
	 * The running programs as a popover over the status bar's chip (plan 359, ADR 0302): a modal
	 * `<dialog>` (focus stays inside, Escape closes, focus goes back to the chip) over a dark glass
	 * backdrop, anchored above the chip with an arrow. Rows are grouped by vessel; each has Open
	 * panel when its program has one, and Stop; a vessel that is not the active one has Vessel.
	 */
	import { manualText, type ProgramGroup } from '../programs-model';

	type Row = ProgramGroup['rows'][number];
	let {
		open,
		anchor,
		groups,
		onclose,
		onpanel,
		onvessel,
		onstop
	}: {
		open: boolean;
		/** The chip it points at. */
		anchor: HTMLElement | undefined;
		groups: readonly ProgramGroup[];
		onclose: () => void;
		onpanel: (row: Row) => void;
		onvessel: (vessel: number) => void;
		onstop: (row: Row) => void;
	} = $props();

	let el = $state<HTMLDialogElement>();
	let at = $state({ x: 0, bottom: 0 });
	const place = (): void => {
		const r = anchor?.getBoundingClientRect();
		if (r) at = { x: r.left + r.width / 2, bottom: innerHeight - r.top + 10 };
	};
	$effect(() => {
		if (!el) return;
		if (open && !el.open) {
			place();
			el.showModal();
		}
		if (!open && el.open) el.close();
	});
	// the card stays inside the window; the arrow keeps pointing at the chip
	const WIDTH = 416;
	const left = $derived(
		Math.min(
			Math.max(at.x - WIDTH / 2, 16),
			(typeof innerWidth === 'number' ? innerWidth : 1280) - WIDTH - 16
		)
	);
	const many = $derived(groups.length > 1);
</script>

<svelte:window onresize={() => open && place()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={el}
	class="pop"
	aria-label="Running programs"
	data-testid="programs-list"
	style="left:{left}px;bottom:{at.bottom}px;--arrow:{at.x - left}px"
	onkeydown={(e) => {
		// before the page's own keys (Flight's Escape opens its menu)
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	onclick={(e) => {
		if (e.target === el) onclose();
	}}
>
	<div class="card">
		<div class="head">
			<span class="cap">Running programs</span>
			<button type="button" class="x" aria-label="Close" onclick={onclose}
				><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"
					><path d="M6 6 L18 18 M18 6 L6 18" /></svg
				></button
			>
		</div>
		{#each groups as g (g.vessel)}
			<section class="group" class:boxed={many} aria-label="{g.vesselName} programs">
				<div class="vessel">
					<span class="vname">{g.vesselName}</span>
					{#if g.active}
						<span class="tag">Active vessel</span>
					{:else}
						<button
							type="button"
							class="btn"
							data-testid="program-vessel-{g.vessel}"
							data-tip="Make {g.vesselName} the active vessel"
							onclick={() => onvessel(g.vessel)}>Vessel</button
						>
					{/if}
				</div>
				{#each g.rows as r (`${r.kind}-${r.title}`)}
					<div class="row">
						<span class="pulse" class:held={r.manual.length > 0} aria-hidden="true"></span>
						<div class="what">
							<b>{r.title}</b>
							<span
								>{r.kind === 'autopilot' ? 'Autopilot' : 'Script'}{r.detail
									? ` · ${r.detail}`
									: ''}</span
							>
							{#if r.manual.length > 0}<span class="held">Manual: {manualText(r.manual)}</span>{/if}
						</div>
						<div class="acts">
							{#if r.panel}
								<button
									type="button"
									class="btn"
									data-testid="program-panel-{g.vessel}-{r.kind}"
									data-tip="Open {r.panel.title}"
									onclick={() => onpanel(r)}>Open panel</button
								>
							{/if}
							<button
								type="button"
								class="btn stop"
								aria-label="Stop {r.title} on {g.vesselName}"
								data-testid="program-stop-{g.vessel}-{r.kind}"
								onclick={() => onstop(r)}>Stop</button
							>
						</div>
					</div>
				{/each}
			</section>
		{/each}
		<p class="note">
			Programs keep flying when you look away. Touch a control to take it; the program resumes 1 s
			after you let go.
		</p>
	</div>
</dialog>

<style>
	dialog.pop {
		position: fixed;
		inset: auto;
		margin: 0;
		width: 26rem;
		max-width: calc(100vw - 2rem);
		max-height: min(70vh, 34rem);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		overflow: visible;
		/* not the status bar's 10 px nowrap it sits in */
		white-space: normal;
		font-size: var(--t-small);
		line-height: 1.4;
		font-variant-numeric: normal;
	}
	/* the dark glass behind (ADR 0302 point 2); a plain dark veil where blur is missing */
	dialog.pop::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
	@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		dialog.pop::backdrop {
			background: rgb(0 0 0 / 0.42);
			-webkit-backdrop-filter: blur(10px) saturate(1.1);
			backdrop-filter: blur(10px) saturate(1.1);
		}
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: min(70vh, 34rem);
		overflow-y: auto;
		box-sizing: border-box;
		padding: 0.75rem;
		border-radius: 1rem;
		background: rgb(22 23 26 / 0.92);
		border: 1px solid rgb(255 255 255 / 0.12);
		box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
		scrollbar-width: thin;
	}
	/* the arrow down to the chip */
	dialog.pop::after {
		content: '';
		position: absolute;
		left: calc(var(--arrow) - 7px);
		bottom: -6px;
		width: 14px;
		height: 14px;
		transform: rotate(45deg);
		background: rgb(22 23 26 / 0.92);
		border-right: 1px solid rgb(255 255 255 / 0.12);
		border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.25rem;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.x {
		display: grid;
		place-items: center;
		width: 1.625rem;
		height: 1.625rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.x:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.x svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.group.boxed {
		padding: 0.5rem;
		border-radius: 0.75rem;
		background: rgb(255 255 255 / 0.04);
	}
	.vessel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.25rem;
	}
	.vname {
		font-size: var(--t-button);
		font-weight: 700;
	}
	.tag {
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.1);
		font-size: var(--t-label);
		font-weight: 700;
		color: var(--text-secondary);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.25rem;
		border-top: 1px solid rgb(255 255 255 / 0.06);
	}
	.pulse {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
	.pulse.held {
		background: #f5a524;
	}
	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
		flex: 1;
		font-size: var(--t-small);
	}
	.what span {
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.what .held {
		color: #f5a524;
	}
	.acts {
		display: flex;
		gap: 0.25rem;
		flex: none;
	}
	.btn {
		height: 1.75rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.btn:hover {
		background: var(--surface-track);
	}
	.btn.stop {
		color: var(--danger);
	}
	.btn:focus-visible,
	.x:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.note {
		margin: 0.25rem 0.25rem 0;
		font-size: var(--t-label);
		line-height: 1.4;
		color: var(--text-subtle);
	}
</style>
