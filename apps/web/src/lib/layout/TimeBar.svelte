<script lang="ts">
	/**
	 * The time bar, top left (BASE_LAYOUT §2, `Base.dc.html`): pause or play, the eight warp
	 * segments, the multiple, a rule and the T+ time. The clock's chip (plan 205) and the catch-up
	 * offer (plan 087) follow the time while they apply.
	 */
	import { behindText, type CatchUp } from '../worlds/world-model';
	import { termTip } from '../public/glossary';
	import { warpSegments, warpText } from './shell-model';

	let {
		t,
		paused,
		pauseLocked = false,
		onpause,
		steps,
		index,
		limit = null,
		reason = '',
		time,
		date = '',
		met = false,
		chip = null,
		onchip,
		onpick,
		catchUp = { kind: 'none' },
		oncatchup
	}: {
		/** The sim time, s (tests read it from `data-t`). */
		t: number;
		/** The clock stands: the segments dim and the multiple reads `—`. */
		paused: boolean;
		pauseLocked?: boolean;
		onpause?: () => void;
		steps: readonly number[];
		index: number;
		limit?: number | null;
		reason?: string;
		/** `T+ 2y 70d 26:32`. */
		time: string;
		date?: string;
		/** The time is the flight's mission time. */
		met?: boolean;
		chip?: string | null;
		/** The chip toggles the place's pause (plan 248); absent where it only displays. */
		onchip?: () => void;
		onpick?: (index: number) => void;
		catchUp?: CatchUp;
		oncatchup?: () => void;
	} = $props();

	const segments = $derived(warpSegments(steps, index, paused, limit));
	const factor = $derived(steps[index] ?? 1);
</script>

<div class="bar time" data-testid="time-bar">
	<button
		type="button"
		class="play"
		data-testid="time-pause"
		aria-label={pauseLocked ? 'Pause is locked in this world' : paused ? 'Resume' : 'Pause'}
		aria-pressed={paused}
		data-tip={pauseLocked ? 'This world does not allow pausing' : 'Pause or resume (P)'}
		disabled={pauseLocked || !onpause}
		onclick={onpause}
	>
		{#if paused}
			<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"
				><path d="M7 4 L20 12 L7 20 Z" fill="currentColor" /></svg
			>
		{:else}
			<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"
				><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect
					x="14"
					y="4"
					width="4"
					height="16"
					rx="1"
					fill="currentColor"
				/></svg
			>
		{/if}
	</button>
	<div class="segs" role="group" aria-label="Time warp">
		{#each segments as s, i (s.factor)}
			<button
				type="button"
				class="seg {s.state}"
				class:wide={s.width === 10}
				class:locked={s.locked}
				aria-label={s.label}
				aria-pressed={i === index}
				data-tip={s.locked && reason ? reason : s.label}
				disabled={!onpick || s.locked}
				onclick={() => onpick?.(i)}
			></button>
		{/each}
	</div>
	<div class="x" data-testid="hud-warp" {...termTip('time-warp')}>{warpText(factor, paused)}</div>
	<span class="sr-only" data-testid="world-warp">{warpText(factor)}</span>
	{#if reason}<span class="why" data-testid="warp-reason">{reason}</span>{/if}
	<div class="rule" aria-hidden="true"></div>
	<div
		class="when"
		data-testid="world-clock"
		data-t={t}
		data-tip={date}
		data-tip-term={met ? 'met' : undefined}
	>
		{#if met}<span data-testid="hud-met">{time}</span>{:else}{time}{/if}
	</div>
	<!-- one badge for every pause state (plan 256); it is a button only where it can lift the place's pause -->
	{#if chip && onchip}
		<button
			type="button"
			class="chip toggle"
			data-testid="time-chip"
			data-tip="Run the clock here too (Settings → Time puts the pause back)"
			onclick={onchip}>{chip}</button
		>
	{:else if chip}<span class="chip" data-testid="time-chip">{chip}</span>{/if}
	{#if catchUp.kind !== 'none'}
		<button
			type="button"
			class="catch-up"
			data-testid="catch-up"
			disabled={catchUp.kind === 'unavailable'}
			data-tip={catchUp.kind === 'offer'
				? `The world is ${behindText(catchUp.behindSeconds)} behind the real date: warp to ${catchUp.date}`
				: catchUp.reason}
			onclick={() => oncatchup?.()}>Catch up to now</button
		>
		<span class="sr-only" data-testid="catch-up-why"
			>{catchUp.kind === 'offer'
				? `${behindText(catchUp.behindSeconds)} behind the real date`
				: `Catch up is unavailable: ${catchUp.reason}`}</span
		>
	{/if}
</div>

<style>
	/* sizes in rem of the 16 px root: px at 100 % (BASE_LAYOUT §1) */
	.bar {
		position: fixed;
		z-index: 40;
		left: calc(1.5rem + var(--safe-left));
		top: calc(1.5rem + var(--safe-top));
		display: flex;
		align-items: center;
		gap: 0.625rem;
		height: 2.75rem;
		box-sizing: border-box;
		padding: 0.25rem 0.875rem 0.25rem 0.25rem;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 999px;
		color: #fff;
		font-variant-numeric: tabular-nums;
	}
	.play {
		width: 2.25rem;
		height: 2.25rem;
		flex: none;
		border-radius: 50%;
		border: none;
		background: #f4f4f5;
		color: #0b0b0c;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
	}
	.play svg {
		width: 0.875rem;
		height: 0.875rem;
	}
	.play:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.segs {
		display: flex;
		align-items: center;
		gap: 0.1875rem;
	}
	.seg {
		width: 0.375rem;
		height: 1.125rem;
		border: none;
		padding: 0;
		border-radius: 3px;
		background: rgb(255 255 255 / 0.12);
		cursor: pointer;
	}
	.seg:disabled {
		cursor: default;
	}
	.seg.wide {
		width: 0.625rem;
	}
	.seg.past {
		background: #f4f4f5;
	}
	.seg.now {
		background: var(--accent);
	}
	.seg.locked {
		opacity: 0.4;
	}
	.x {
		min-width: 2.125rem;
		font-size: 0.75rem;
		line-height: 1;
		font-weight: 600;
		color: #fff;
	}
	.why {
		font-size: 0.625rem;
		line-height: 1;
		color: var(--c-warning);
		white-space: nowrap;
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		background: rgb(255 255 255 / 0.12);
	}
	.when {
		font-size: 0.75rem;
		line-height: 1;
		font-weight: 500;
		color: #fff;
		white-space: nowrap;
	}
	/* the clock's state, in the status bar's mode chip style */
	.chip {
		box-sizing: border-box;
		margin: 0;
		border: 0;
		appearance: none;
		font-family: inherit;
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
		white-space: nowrap;
	}
	/* a button badge looks like the plain one; only the pointer and a hover tell it is pressable */
	.chip.toggle {
		cursor: pointer;
	}
	.chip.toggle:hover {
		background: rgb(255 255 255 / 0.18);
	}
	.chip.toggle:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 1px;
	}
	.catch-up {
		height: 1.5rem;
		padding: 0 0.625rem;
		border: 1px solid rgb(255 255 255 / 0.12);
		border-radius: 999px;
		background: transparent;
		color: #fff;
		font: inherit;
		font-size: 0.625rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.catch-up:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
