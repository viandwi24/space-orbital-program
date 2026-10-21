<script lang="ts">
	/**
	 * Toasts (plan 021, ADR 0026; v3 since plan 274, V3_CHANGES §2.2): events, not conditions. At most
	 * two, 380 wide at the top centre: an icon tile in the event's tone, the title with a ×n badge when
	 * the same event came again, the detail, and a dismiss button. Conditions are the status strip's.
	 */
	import type { LiveToast } from '../toasts';
	import Icon from './Icon.svelte';
	import { REGIONS } from '../layout/regions';

	let { toasts }: { toasts: readonly LiveToast[] } = $props();
	const icon = { info: 'info', success: 'check', warning: 'alert', danger: 'flame' } as const;
	/** Dismissed here; a toast leaves the store on its own when its time is up. */
	let dismissed = $state<ReadonlySet<number>>(new Set());
	const shown = $derived(toasts.filter((t) => !dismissed.has(t.id)).slice(-REGIONS.toasts));
</script>

<!-- Polite live region; danger toasts are announced assertively by their own role. -->
<div class="toasts" aria-live="polite" aria-atomic="false">
	{#each shown as t (t.id)}
		<div class="toast {t.kind}" role={t.kind === 'danger' ? 'alert' : 'status'}>
			<span class="ico"><Icon name={icon[t.kind]} size={14} /></span>
			<div class="words">
				<div class="title">
					{t.title}{#if t.count > 1}<span class="count" data-testid="toast-count">×{t.count}</span
						>{/if}
				</div>
				{#if t.detail}<div class="detail">{t.detail}</div>{/if}
			</div>
			<button
				type="button"
				class="close"
				aria-label="Dismiss"
				data-tip="Dismiss"
				onclick={() => (dismissed = new Set([...dismissed, t.id]))}
				><svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"
					><path d="M6 6 L18 18 M18 6 L6 18" /></svg
				></button
			>
		</div>
	{/each}
</div>

<style>
	.toasts {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: min(23.75rem, calc(100vw - 3rem));
		pointer-events: none;
	}
	/* V3 §2.2: glass radius 12, icon 28, title 12/600, detail 10 */
	.toast {
		width: 100%;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 2.75rem;
		padding: 0.5rem 0.375rem 0.5rem 0.5rem;
		background: rgb(22 23 26 / 0.72);
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: var(--radius-card);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		animation: in var(--dur-med) var(--ease);
		pointer-events: auto;
	}
	.ico {
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		display: grid;
		place-items: center;
		border-radius: 8px;
		color: var(--tone);
		background: color-mix(in srgb, var(--tone) 14%, transparent);
	}
	.words {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--t-button);
		line-height: 1.2;
		font-weight: 600;
		color: var(--text-primary);
	}
	.count {
		height: 0.9375rem;
		padding: 0 5px;
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.1);
		color: var(--text-secondary);
		font-size: var(--t-label);
		font-weight: 700;
	}
	.detail {
		font-size: var(--t-label);
		line-height: 1.3;
		color: var(--text-muted);
	}
	.close {
		margin-left: auto;
		flex: none;
		width: 1.625rem;
		height: 1.625rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.close:focus-visible {
		outline: 2px solid var(--text-primary);
	}
	.close svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
	}
	.info {
		--tone: var(--text-muted);
	}
	.success {
		--tone: var(--ok);
	}
	.warning {
		--tone: var(--warn);
	}
	.danger {
		--tone: var(--danger);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}
</style>
