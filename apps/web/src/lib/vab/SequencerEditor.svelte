<script lang="ts">
	/**
	 * The selected sequencer's keyframe tracks (plan 282, ADR 0348): a joint and a strip of keyframes
	 * per track, with the time and value of each keyframe as number fields, and the play mode. In flight the
	 * part's own controls (Play sequence, Rewind) run it.
	 */
	import {
		MAX_TRACKS,
		SEQUENCER_MODES,
		addKey,
		addTrack,
		durationOf,
		keyPosition,
		removeKey,
		removeTrack,
		setKey,
		setMode,
		type SequencerMode
	} from '../editor/sequencer-edit';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
	const seq = $derived(vab.selectedSequencer);
	const joints = $derived(vab.sequencerJoints);
	const duration = $derived(seq ? durationOf(seq.tracks) : 0);
	const num = (e: Event): number => Number((e.currentTarget as HTMLInputElement).value);
	const jointOf = (index: number) => joints.find((j) => j.index === index);
	const MODE_LABELS: Record<SequencerMode, string> = {
		once: 'Once',
		loop: 'Loop',
		pingpong: 'Back and forth'
	};
</script>

{#if seq}
	<section class="seq" aria-label="Sequencer" data-testid="sequencer-editor">
		<header>
			<h3>Sequence</h3>
			<span class="dim">{duration.toFixed(1)} s</span>
			<select
				aria-label="Play mode"
				value={seq.mode}
				onchange={(e) =>
					vab.editSequencer((c) => setMode(c, e.currentTarget.value as SequencerMode))}
			>
				{#each SEQUENCER_MODES as m (m)}<option value={m}>{MODE_LABELS[m]}</option>{/each}
			</select>
		</header>
		{#if joints.length === 0}
			<p class="dim">No joints on the vessel yet: add a hinge, servo or piston.</p>
		{/if}
		{#each seq.tracks as track, i (i)}
			{@const joint = jointOf(track.part)}
			<div class="track" data-testid="sequencer-track">
				<div class="head">
					<span
						>{joint
							? `${joint.title} (part ${joint.index})`
							: `part ${track.part}: not a joint`}</span
					>
					<button
						type="button"
						class="link"
						aria-label="Remove track {i + 1}"
						onclick={() => vab.editSequencer((c) => removeTrack(c, i))}>Remove</button
					>
				</div>
				<div class="strip" aria-hidden="true">
					{#each track.keys as k, n (n)}
						<span class="key" style="left: {keyPosition(k.t, duration) * 100}%"></span>
					{/each}
				</div>
				{#each track.keys as k, n (n)}
					<div class="row">
						<label
							><span class="dim">At, s</span>
							<input
								type="number"
								min="0"
								step="0.1"
								value={k.t}
								aria-label="Track {i + 1} key {n + 1} time"
								onchange={(e) => vab.editSequencer((c) => setKey(c, i, n, { t: num(e) }, joint))}
							/></label
						>
						<label
							><span class="dim">{joint?.unit === 'm' ? 'Extension, m' : 'Angle, °'}</span>
							<input
								type="number"
								step={joint?.unit === 'm' ? 0.05 : 5}
								value={k.value}
								aria-label="Track {i + 1} key {n + 1} value"
								onchange={(e) =>
									vab.editSequencer((c) => setKey(c, i, n, { value: num(e) }, joint))}
							/></label
						>
						<button
							type="button"
							class="link"
							aria-label="Remove key {n + 1} of track {i + 1}"
							disabled={track.keys.length <= 1}
							onclick={() => vab.editSequencer((c) => removeKey(c, i, n))}>×</button
						>
					</div>
				{/each}
				<button type="button" class="link" onclick={() => vab.editSequencer((c) => addKey(c, i))}
					>Add a keyframe</button
				>
			</div>
		{/each}
		{#if seq.tracks.length < MAX_TRACKS && joints.length > 0}
			<label class="add">
				<span class="dim">Add a track for</span>
				<select
					aria-label="Add a track"
					value=""
					onchange={(e) => {
						const joint = jointOf(Number(e.currentTarget.value));
						if (joint) vab.editSequencer((c) => addTrack(c, joint));
						e.currentTarget.value = '';
					}}
				>
					<option value="" disabled>a joint…</option>
					{#each joints as j (j.index)}<option value={j.index}>{j.title} (part {j.index})</option
						>{/each}
				</select>
			</label>
		{/if}
	</section>
{/if}

<style>
	.seq {
		display: grid;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-top: 1px solid rgb(255 255 255 / 0.1);
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	h3 {
		margin: 0;
		font-size: 0.9rem;
	}
	.track {
		display: grid;
		gap: 0.3rem;
		padding: 0.4rem;
		border-radius: 0.5rem;
		background: rgb(255 255 255 / 0.04);
	}
	.head {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
	}
	.strip {
		position: relative;
		height: 0.7rem;
		border-radius: 0.35rem;
		background: rgb(255 255 255 / 0.1);
	}
	.key {
		position: absolute;
		top: 0.1rem;
		width: 0.5rem;
		height: 0.5rem;
		margin-left: -0.25rem;
		border-radius: 50%;
		background: var(--accent, #e3a61f);
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: end;
	}
	.row label {
		display: grid;
		gap: 0.1rem;
		font-size: 0.75rem;
	}
	input,
	select {
		width: 5.5rem;
		padding: 0.15rem 0.35rem;
		border-radius: 0.4rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		background: rgb(0 0 0 / 0.25);
		color: inherit;
		font: inherit;
	}
	select {
		width: auto;
	}
	.link {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		opacity: 0.8;
		text-decoration: underline;
		cursor: pointer;
		justify-self: start;
	}
	.dim {
		opacity: 0.7;
		font-size: 0.8rem;
	}
	.add {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
</style>
