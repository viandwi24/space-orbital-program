<script lang="ts">
	import { onDestroy } from 'svelte';

	/**
	 * A soft highlight round the element a guide step names (plan 344): the guide card sits in the
	 * bottom-left corner, away from the control it talks about. It follows the element by its test
	 * id, and draws nothing while the element is hidden or absent.
	 */
	let { testid }: { testid: string | null } = $props();

	let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let frame = 0;

	function track(): void {
		frame = requestAnimationFrame(track);
		const el = testid ? document.querySelector(`[data-testid="${CSS.escape(testid)}"]`) : null;
		const r = el?.getBoundingClientRect();
		const next =
			r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
		if (next?.x !== rect?.x || next?.y !== rect?.y || next?.w !== rect?.w || next?.h !== rect?.h)
			rect = next;
	}
	$effect(() => {
		void testid;
		cancelAnimationFrame(frame);
		// from the next frame: the effect must not depend on the rect it sets
		if (testid) frame = requestAnimationFrame(track);
		else rect = null;
		return () => cancelAnimationFrame(frame);
	});
	onDestroy(() => cancelAnimationFrame(frame));
</script>

{#if rect}
	<div
		class="ring"
		aria-hidden="true"
		data-testid="guide-pointer"
		style:left="{rect.x - 4}px"
		style:top="{rect.y - 4}px"
		style:width="{rect.w + 8}px"
		style:height="{rect.h + 8}px"
	></div>
{/if}

<style>
	.ring {
		position: fixed;
		z-index: 60;
		box-sizing: border-box;
		border: 2px solid var(--accent-text);
		border-radius: 10px;
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-text) 22%, transparent);
		pointer-events: none;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-text) 8%, transparent);
			opacity: 0.75;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ring {
			animation: none;
		}
	}
</style>
