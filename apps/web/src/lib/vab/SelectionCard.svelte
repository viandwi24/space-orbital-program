<script lang="ts">
	import { surfaceHalfHeight, type DesignTilt } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { stageOf } from '../editor/state';
	import type { VabController } from './controller.svelte';
	import { settings } from '../settings/settings.svelte';

	let { vab }: { vab: VabController } = $props();

	const sel = $derived(vab.selected);
	const radial = $derived(vab.selectedRadial);
	const parentHeight = $derived.by(() => {
		if (!radial) return 0;
		const parent = vab.current.design.parts.find((p) => p.index === radial.parent);
		const shape = parent && vab.defOf(parent.part)?.shape;
		return shape ? surfaceHalfHeight(shape) * 2 : 0;
	});
	const degrees = (rad: number): number =>
		Math.round(((((rad * 180) / Math.PI) % 360) + 360) % 360);
	const toRad = (deg: number): number => (deg * Math.PI) / 180;
	const tilt = $derived(vab.selectedTilt);
	const signed = (rad: number): number => Math.round((rad * 180) / Math.PI);
	const AXES: { axis: keyof DesignTilt; label: string; hint: string }[] = [
		{ axis: 'x', label: 'Tilt X', hint: 'about the parent X axis (incidence of a wing)' },
		{ axis: 'y', label: 'Tilt Y', hint: 'about the parent vertical axis' },
		{ axis: 'z', label: 'Tilt Z', hint: 'about the parent Z axis (cant of an engine)' }
	];
</script>

{#snippet act(
	icon: string,
	label: string,
	caption: string,
	hint: string,
	disabled: boolean,
	run: () => void
)}
	<button
		type="button"
		class="act"
		{disabled}
		aria-label={label}
		title="{label} ({hint})"
		onclick={run}
	>
		<Icon name={icon} size={20} />
		<span>{caption}</span>
	</button>
{/snippet}

{#if vab.selectedEntry && sel !== null && !vab.armed}
	<section class="card" aria-label="Selected part">
		<header>
			<h2>{vab.titleOfPart(sel)}</h2>
			<button
				type="button"
				class="x"
				aria-label="Deselect"
				title="Deselect (Esc)"
				onclick={() => (vab.selected = null)}
			>
				<Icon name="close" size={16} />
			</button>
		</header>
		<p class="dim sub">
			{#if vab.subtreeSize > 1}and {vab.subtreeSize - 1} attached{/if}
			{#if vab.groupSize > 1}{vab.subtreeSize > 1 ? ' · ' : ''}x{vab.groupSize} symmetric{/if}
			{#if vab.selectedLoose}{vab.subtreeSize > 1 || vab.groupSize > 1 ? ' · ' : ''}loose on the
				floor{/if}
			{#if vab.subtreeSize <= 1 && vab.groupSize <= 1 && !vab.selectedLoose}single part{/if}
		</p>
		{#if vab.reliabilityOfPart(sel)}
			<p class="dim sub" data-testid="vab-reliability">{vab.reliabilityOfPart(sel)}</p>
		{/if}

		<div class="acts" role="toolbar" aria-label="Actions for the selected part">
			{@render act(
				'move',
				vab.groupSize > 1 && !vab.onlyThis ? 'Move with its copies' : 'Move',
				'Move',
				'M',
				false,
				() => vab.carrySelected(vab.onlyThis)
			)}
			{@render act('detach', 'Detach', 'Detach', 'D', vab.selectedLoose, () =>
				vab.detachSelected()
			)}
			{@render act(
				'trash',
				vab.groupSize > 1 && !vab.onlyThis ? 'Delete with its copies' : 'Delete',
				'Delete',
				'Del',
				false,
				() => vab.removeSelected(vab.onlyThis)
			)}
			{@render act(
				'assembly',
				'Keep this part and what hangs on it as a sub-assembly',
				'Keep',
				'A',
				false,
				() => void vab.saveSelectedAsAssembly()
			)}
		</div>
		{#if vab.groupSize > 1 || vab.radialGroupSize > 1}
			<label class="only">
				<input type="checkbox" bind:checked={vab.onlyThis} />
				<span class="dim"
					>Only this part, not its {Math.max(vab.groupSize, vab.radialGroupSize) - 1} copies</span
				>
			</label>
		{/if}

		{#if !vab.selectedLoose}
			<label class="row">
				<span class="dim">Stage</span>
				<select
					aria-label="Stage of {vab.titleOfPart(sel)}"
					value={stageOf(vab.editor.design, sel) ?? ''}
					onchange={(e) => {
						const v = e.currentTarget.value;
						vab.moveStage(sel, v === '' ? null : Number(v));
					}}
				>
					<option value="">None</option>
					{#each Array.from({ length: Math.max(vab.editor.design.stages.length, 1) + 1 }, (_, k) => k) as k (k)}
						<option value={k}>{k + 1}{k >= vab.editor.design.stages.length ? ' (new)' : ''}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if radial}
			<div
				class="turn"
				role="group"
				aria-label="Position of the {vab.titleOfPart(radial.index)} on the {vab.titleOfPart(
					radial.parent
				)}"
			>
				<label class="row">
					<span class="dim">Angle</span>
					<input
						type="range"
						min="0"
						max="359"
						step="1"
						value={degrees(radial.angle)}
						aria-valuetext="{degrees(radial.angle)} degrees"
						oninput={(e) =>
							vab.turnSelected(
								{ angle: toRad(Number(e.currentTarget.value)) },
								{ single: vab.onlyThis, commit: false }
							)}
						onchange={(e) =>
							vab.turnSelected(
								{ angle: toRad(Number(e.currentTarget.value)) },
								{ single: vab.onlyThis, commit: true }
							)}
					/>
					<span class="num val">{degrees(radial.angle)}°</span>
				</label>
				{#if parentHeight > 0}
					<label class="row">
						<span class="dim">Height</span>
						<input
							type="range"
							min={-parentHeight / 2}
							max={parentHeight / 2}
							step="0.05"
							value={radial.y}
							aria-valuetext="{radial.y.toFixed(2)} metres from the middle"
							oninput={(e) =>
								vab.turnSelected(
									{ y: Number(e.currentTarget.value) },
									{ single: vab.onlyThis, commit: false }
								)}
							onchange={(e) =>
								vab.turnSelected(
									{ y: Number(e.currentTarget.value) },
									{ single: vab.onlyThis, commit: true }
								)}
						/>
						<span class="num val">{radial.y.toFixed(2)} m</span>
					</label>
				{/if}
				<p class="foot dim">
					<Kbd>{settings.keymap.label('turnPlus')}</Kbd>
					<Kbd>{settings.keymap.label('turnMinus')}</Kbd> turn the {vab.radialGroupSize > 1 &&
					!vab.onlyThis
						? 'group'
						: 'part'}
				</p>
			</div>
		{/if}
		{#if tilt}
			<div class="turn" role="group" aria-label="Tilt of {vab.titleOfPart(sel)}">
				{#each AXES as a (a.axis)}
					<label class="row" title={a.hint}>
						<span class="dim">{a.label}</span>
						<input
							type="range"
							min="-90"
							max="90"
							step="1"
							value={signed(tilt[a.axis])}
							aria-valuetext="{signed(tilt[a.axis])} degrees"
							oninput={(e) =>
								vab.tiltSelected(
									{ [a.axis]: toRad(Number(e.currentTarget.value)) },
									{ single: vab.onlyThis, commit: false }
								)}
							onchange={(e) =>
								vab.tiltSelected(
									{ [a.axis]: toRad(Number(e.currentTarget.value)) },
									{ single: vab.onlyThis, commit: true }
								)}
						/>
						<span class="num val">{signed(tilt[a.axis])}°</span>
					</label>
				{/each}
				<button
					type="button"
					class="reset"
					disabled={tilt.x === 0 && tilt.y === 0 && tilt.z === 0}
					onclick={() =>
						vab.tiltSelected({ x: 0, y: 0, z: 0 }, { single: vab.onlyThis, commit: true })}
				>
					Reset tilt
				</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	.reset {
		justify-self: end;
		padding: 2px var(--s-2);
		font-size: var(--t-xs);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.reset:disabled {
		color: var(--text-faint);
		cursor: default;
		opacity: 0.6;
	}
	.card {
		flex: none;
		display: grid;
		gap: var(--s-2);
		padding: var(--s-3);
		background: var(--panel);
		border: 1px solid var(--c-accent);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
	}
	h2 {
		margin: 0;
		font-size: var(--t-md);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.x {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.x:hover {
		color: var(--text);
	}
	.sub {
		margin: -4px 0 0;
		font-size: var(--t-xs);
	}
	.dim {
		color: var(--text-dim);
	}
	.acts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 2px;
	}
	.act {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: 6px 2px 4px;
		font-size: var(--t-xs);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.act:hover:not(:disabled) {
		border-color: var(--c-accent);
	}
	.act:disabled {
		color: var(--text-faint);
		cursor: default;
		opacity: 0.6;
	}
	.act:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.row {
		display: grid;
		grid-template-columns: 3.4em minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-sm);
	}
	select {
		height: 28px;
		padding: 0 var(--s-2);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	label.row:has(select) {
		grid-template-columns: 3.4em minmax(0, 1fr);
	}
	.turn {
		display: grid;
		gap: var(--s-2);
		padding-top: var(--s-2);
		border-top: 1px solid var(--line);
	}
	input[type='range'] {
		width: 100%;
		min-width: 0;
		accent-color: var(--c-accent);
	}
	.val {
		min-width: 3.8em;
		text-align: right;
		font-size: var(--t-sm);
	}
	.foot {
		margin: 0;
		font-size: var(--t-xs);
		text-align: right;
	}
	.only {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
</style>
