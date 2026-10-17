<script lang="ts">
	import { onMount } from 'svelte';
	import { classifyScreen, smallScreenAdvice, type ScreenClass } from '../layout/layout-model';
	import Button from './Button.svelte';

	/**
	 * A screen below 900 x 500 CSS px (a phone, a tablet in portrait) is not supported (plan 053,
	 * ADR 0063, ADR 0091): the game still loads, this says what to do about it once per session and
	 * offers to carry on. The wording follows the kind of screen (`layout-model.ts`).
	 */
	const KEY = 'orbital.small-screen-ok';
	let screen = $state<ScreenClass>('ok');
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
			void (screen = classifyScreen({ width: innerWidth, height: innerHeight }));
		sync();
		addEventListener('resize', sync);
		return () => removeEventListener('resize', sync);
	});
</script>

{#if screen !== 'ok' && !dismissed}
	<div class="notice" role="status" data-testid="small-screen-notice" data-screen={screen}>
		<p>
			<strong>Orbital is made for larger screens.</strong>
			{smallScreenAdvice(screen)}
		</p>
		<Button onclick={dismiss} data-testid="small-screen-continue">Continue anyway</Button>
	</div>
{/if}

<style>
	.notice {
		position: fixed;
		z-index: 60;
		top: calc(var(--s-3) + var(--safe-top));
		left: calc(var(--s-3) + var(--safe-left));
		right: calc(var(--s-3) + var(--safe-right));
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
