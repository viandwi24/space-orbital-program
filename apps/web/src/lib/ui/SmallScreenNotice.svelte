<script lang="ts">
	import { onMount } from 'svelte';
	import { isSmallScreen, MIN_VIEWPORT } from '../touch/touch-model';
	import Button from './Button.svelte';

	/**
	 * A screen below 900 x 500 CSS px (a phone, a tablet in portrait) is not supported (plan 053,
	 * ADR 0063): the game still loads, this says so once per session and offers to carry on.
	 */
	const KEY = 'orbital.small-screen-ok';
	let small = $state(false);
	let dismissed = $state(false);

	function remembered(): boolean {
		try {
			return sessionStorage.getItem(KEY) === '1';
		} catch {
			return false;
		}
	}
	function dismiss(): void {
		dismissed = true;
		try {
			sessionStorage.setItem(KEY, '1');
		} catch {
			// private mode: asked again on the next page
		}
	}
	onMount(() => {
		dismissed = remembered();
		const sync = (): void =>
			void (small = isSmallScreen({ width: innerWidth, height: innerHeight }));
		sync();
		addEventListener('resize', sync);
		return () => removeEventListener('resize', sync);
	});
</script>

{#if small && !dismissed}
	<div class="notice" role="status" data-testid="small-screen-notice">
		<p>
			<strong>Orbital is made for larger screens.</strong>
			It needs a tablet in landscape or a computer, at least {MIN_VIEWPORT.width} × {MIN_VIEWPORT.height}
			pixels. On this screen the game may be hard or impossible to use.
		</p>
		<Button onclick={dismiss} data-testid="small-screen-continue">Continue anyway</Button>
	</div>
{/if}

<style>
	.notice {
		position: fixed;
		z-index: 60;
		top: var(--s-3);
		left: var(--s-3);
		right: var(--s-3);
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		background: var(--panel-solid);
		border: 1px solid var(--c-warning);
		border-radius: var(--r-panel);
		box-shadow: var(--shadow-overlay);
	}
	p {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.4;
	}
</style>
