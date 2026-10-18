<script lang="ts">
	import { rollAxis, stickAxes, throttleFromSlider } from '../touch/touch-model';

	/**
	 * The on-screen flight controls for tablets (plan 053, ADR 0063): a throttle slider with Full
	 * and Cut, a steering pad (pitch and yaw), roll buttons and Stage. All of them speak the same
	 * numbers the keyboard does; the maths is in `touch-model.ts`. SAS and Map are the HUD buttons.
	 */
	let {
		throttle,
		onthrottle,
		onattitude,
		onstage,
		anchor
	}: {
		throttle: number;
		onthrottle: (value: number) => void;
		onattitude: (input: { pitch: number; yaw: number; roll: number }) => void;
		onstage: () => void;
		/** Left edge and vertical centre of the throttle, px: clear of the script panel and the deck (plan 055). */
		/** `room`: the free height at the left edge (plan 204: the world bars take some). */
		anchor?: { left: number; centre: number; room?: number };
	} = $props();

	let track: HTMLDivElement;
	let pad: HTMLDivElement;
	let knob = $state({ x: 0, y: 0 });
	let stick = { pitch: 0, yaw: 0 };
	let roll = { minus: false, plus: false };

	const send = (): void =>
		onattitude({ pitch: stick.pitch, yaw: stick.yaw, roll: rollAxis(roll.minus, roll.plus) });

	function slide(e: PointerEvent): void {
		const box = track.getBoundingClientRect();
		onthrottle(throttleFromSlider(e.clientY, box.top, box.height));
	}
	function slideDown(e: PointerEvent): void {
		track.setPointerCapture(e.pointerId);
		slide(e);
	}
	function slideMove(e: PointerEvent): void {
		if (track.hasPointerCapture(e.pointerId)) slide(e);
	}

	function steer(e: PointerEvent): void {
		const box = pad.getBoundingClientRect();
		const radius = box.width / 2;
		const dx = e.clientX - (box.left + radius);
		const dy = e.clientY - (box.top + radius);
		stick = stickAxes(dx, dy, radius);
		// the knob follows the finger but stays on the pad
		const len = Math.hypot(dx, dy);
		const k = len > radius ? radius / len : 1;
		knob = { x: dx * k, y: dy * k };
		send();
	}
	function steerDown(e: PointerEvent): void {
		pad.setPointerCapture(e.pointerId);
		steer(e);
	}
	function steerMove(e: PointerEvent): void {
		if (pad.hasPointerCapture(e.pointerId)) steer(e);
	}
	function steerEnd(): void {
		stick = { pitch: 0, yaw: 0 };
		knob = { x: 0, y: 0 };
		send();
	}

	function hold(which: 'minus' | 'plus', down: boolean): void {
		roll[which] = down;
		send();
	}
	/** The Full and Cut chips and the gaps around the track, px. */
	const CHIPS = 96;
	/** The track at most 150 px (its CSS height), at least 72, within the free height. */
	const trackHeight = $derived(
		anchor?.room === undefined ? null : Math.max(72, Math.min(150, anchor.room - CHIPS))
	);
</script>

<div class="touch" data-testid="touch-controls" data-silent>
	<div
		class="throttle"
		role="group"
		aria-label="Throttle"
		style:left={anchor ? `calc(${anchor.left}px + var(--safe-left))` : undefined}
		style:top={anchor ? `${anchor.centre}px` : undefined}
	>
		<button type="button" class="chip" onclick={() => onthrottle(1)} data-testid="touch-full"
			>Full</button
		>
		<div
			class="track"
			bind:this={track}
			role="slider"
			tabindex="0"
			aria-label="Throttle"
			aria-orientation="vertical"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(throttle * 100)}
			data-testid="touch-throttle"
			style:height={trackHeight === null ? undefined : `${trackHeight}px`}
			onpointerdown={slideDown}
			onpointermove={slideMove}
		>
			<div class="fill" style:height="{throttle * 100}%"></div>
			<div class="thumb" style:bottom="{throttle * 100}%"></div>
			<span class="num value">{Math.round(throttle * 100)}</span>
		</div>
		<button type="button" class="chip" onclick={() => onthrottle(0)} data-testid="touch-cut"
			>Cut</button
		>
	</div>

	<div class="right">
		<button type="button" class="stage" onclick={onstage} data-testid="touch-stage">Stage</button>
		<div class="roll">
			<button
				type="button"
				class="chip"
				aria-label="Roll left"
				onpointerdown={() => hold('minus', true)}
				onpointerup={() => hold('minus', false)}
				onpointercancel={() => hold('minus', false)}
				onpointerleave={() => hold('minus', false)}>↺</button
			>
			<button
				type="button"
				class="chip"
				aria-label="Roll right"
				onpointerdown={() => hold('plus', true)}
				onpointerup={() => hold('plus', false)}
				onpointercancel={() => hold('plus', false)}
				onpointerleave={() => hold('plus', false)}>↻</button
			>
		</div>
		<div
			class="pad"
			bind:this={pad}
			role="application"
			aria-label="Steering pad: drag to pitch and yaw"
			data-testid="touch-pad"
			onpointerdown={steerDown}
			onpointermove={steerMove}
			onpointerup={steerEnd}
			onpointercancel={steerEnd}
		>
			<div class="knob" style:transform="translate({knob.x}px, {knob.y}px)"></div>
		</div>
	</div>
</div>

<style>
	.touch {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
	}
	.touch > * {
		pointer-events: auto;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.throttle {
		position: absolute;
		left: calc(var(--s-2) + var(--safe-left));
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
	}
	.track {
		position: relative;
		width: 60px;
		height: 150px;
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		overflow: hidden;
		touch-action: none;
	}
	.fill {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--c-accent) 38%, transparent);
	}
	.thumb {
		position: absolute;
		left: 0;
		right: 0;
		height: 4px;
		margin-bottom: -2px;
		background: var(--c-accent);
	}
	.value {
		position: absolute;
		top: var(--s-2);
		left: 0;
		right: 0;
		text-align: center;
		font-size: var(--t-sm);
		color: var(--text);
		pointer-events: none;
	}
	.chip {
		min-width: 52px;
		min-height: 48px;
		padding: 0 var(--s-2);
		font-size: var(--t-md);
		font-weight: 600;
		color: var(--text);
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		touch-action: none;
	}
	.chip:active {
		background: var(--c-accent-dim);
	}
	.right {
		position: absolute;
		right: calc(var(--s-2) + var(--safe-right));
		bottom: calc(var(--s-2) + var(--safe-bottom));
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--s-2);
		pointer-events: none;
	}
	.right > * {
		pointer-events: auto;
	}
	.stage {
		min-width: 112px;
		min-height: 60px;
		font-size: var(--t-md);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--c-ink);
		background: var(--c-warning);
		border: 0;
		border-radius: var(--r-panel);
	}
	.stage:active {
		filter: brightness(0.85);
	}
	.roll {
		display: flex;
		gap: var(--s-2);
	}
	.pad {
		position: relative;
		width: 112px;
		height: 112px;
		display: grid;
		place-items: center;
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		touch-action: none;
	}
	.knob {
		width: 48px;
		height: 48px;
		background: color-mix(in srgb, var(--c-accent) 55%, transparent);
		border: 2px solid var(--c-accent);
		border-radius: 50%;
		pointer-events: none;
	}
</style>
