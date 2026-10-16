<script lang="ts">
	import type { LiveToast } from '../toasts';
	import Icon from './Icon.svelte';

	let { toasts }: { toasts: readonly LiveToast[] } = $props();
	const icon = { info: 'info', success: 'check', warning: 'alert', danger: 'flame' } as const;
</script>

<!-- Polite live region; danger toasts are announced assertively by their own role. -->
<div class="toasts" aria-live="polite" aria-atomic="false">
	{#each toasts as t (t.id)}
		<div class="toast {t.kind}" role={t.kind === 'danger' ? 'alert' : 'status'}>
			<span class="ico"><Icon name={icon[t.kind]} size={18} /></span>
			<div>
				<div class="title">{t.title}</div>
				{#if t.detail}<div class="detail">{t.detail}</div>{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.toasts {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
		pointer-events: none;
	}
	.toast {
		display: flex;
		gap: var(--s-3);
		align-items: flex-start;
		min-width: 240px;
		max-width: 420px;
		padding: var(--s-2) var(--s-4) var(--s-2) var(--s-3);
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px);
		animation: in var(--dur-med) var(--ease);
	}
	.ico {
		margin-top: 1px;
		color: var(--tone);
	}
	.title {
		font-weight: 600;
		font-size: var(--t-md);
	}
	.detail {
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
	.info {
		--tone: var(--c-accent);
	}
	.success {
		--tone: var(--c-positive);
		border-color: rgb(95 227 161 / 0.5);
	}
	.warning {
		--tone: var(--c-warning);
		border-color: rgb(255 191 74 / 0.55);
	}
	.danger {
		--tone: var(--c-danger);
		border-color: rgb(255 114 114 / 0.65);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}
</style>
