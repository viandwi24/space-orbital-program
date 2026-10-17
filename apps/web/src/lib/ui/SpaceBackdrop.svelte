<script lang="ts" module>
	/** The same stars every time (refs Home: 160 points, seeded): box-shadows on one 1 px dot. */
	function starfield(count: number, seed: number): { small: string; large: string } {
		let s = seed;
		const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
		const small: string[] = [];
		const large: string[] = [];
		for (let i = 0; i < count; i++) {
			const big = rnd() >= 0.88;
			const x = (rnd() * 100).toFixed(2);
			const y = (rnd() * 76).toFixed(2);
			const a = (0.2 + rnd() * 0.5).toFixed(2);
			(big ? large : small).push(`${x}vw ${y}vh 0 rgb(255 255 255 / ${a})`);
		}
		return { small: small.join(','), large: large.join(',') };
	}
	const STARS = starfield(160, 21);
</script>

<script lang="ts">
	/**
	 * The menus' backdrop (plan 089, refs Home): black space, a seeded starfield and the home planet's
	 * limb low on the right. CSS only: no image to load before the menu shows.
	 */
	let { planet = true }: { planet?: boolean } = $props();
</script>

<div class="space" aria-hidden="true">
	<span class="stars" style:box-shadow={STARS.small}></span>
	<span class="stars big" style:box-shadow={STARS.large}></span>
	{#if planet}<span class="limb"></span>{/if}
</div>

<style>
	.space {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--bg-space);
	}
	.stars {
		position: absolute;
		left: 0;
		top: 0;
		width: 1px;
		height: 1px;
		border-radius: 50%;
	}
	.stars.big {
		width: 2px;
		height: 2px;
	}
	/* refs: a 2600 px disc at (560, 820) of a 1920 x 1080 frame */
	.limb {
		position: absolute;
		left: 29vw;
		top: 76vh;
		width: max(135vw, 160vh);
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(
			circle at 40% 6%,
			#5f8fbd 0%,
			#2c5a86 10%,
			#143656 24%,
			#08182a 40%,
			#03080f 60%
		);
		box-shadow:
			0 0 0 2px rgb(150 190 255 / 0.35),
			0 0 120px 24px rgb(70 130 255 / 0.25);
	}
	@media (prefers-reduced-motion: no-preference) {
		.limb {
			animation: rise 1.2s var(--ease) both;
		}
	}
	@keyframes rise {
		from {
			transform: translateY(2vh);
			opacity: 0.6;
		}
	}
</style>
