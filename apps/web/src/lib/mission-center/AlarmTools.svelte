<script lang="ts">
	/**
	 * The Upcoming panel's alarm tools (plan 224, ADR 0223): add or edit a time alarm, and the next
	 * transfer window from the focused vessel to a body with its date, wait and delta-v, which can
	 * become an alarm. The sim keeps the alarms; this only sends `add-alarm`.
	 */
	import Button from '../ui/Button.svelte';
	import { formatDuration, formatSpeed } from '../format';
	import { parseDuration } from './model';

	export interface AlarmDraft {
		id?: string;
		name: string;
		inSeconds: number;
	}

	let {
		editing = null,
		onsave,
		oncancel,
		destinations = [],
		destination = null,
		ondestination,
		window = null,
		onwindowalarm
	}: {
		/** The alarm being edited (its id, name and seconds left), or null for a new one. */
		editing?: AlarmDraft | null;
		onsave: (draft: AlarmDraft) => void;
		oncancel?: () => void;
		/** Bodies the focused vessel can have a window to, `{ id, label }`. */
		destinations?: readonly { id: string; label: string }[];
		destination?: string | null;
		ondestination?: (id: string | null) => void;
		/** The next window's date, wait and delta-v, or why there is none. */
		window?: { date: string; wait: number; dv: number } | string | null;
		onwindowalarm?: () => void;
	} = $props();

	let name = $state('');
	let when = $state('');
	let error = $state<string | null>(null);
	let lastEditing: AlarmDraft | null = null;
	$effect(() => {
		if (editing === lastEditing) return;
		lastEditing = editing;
		name = editing?.name ?? '';
		when = editing ? formatDuration(editing.inSeconds) : '';
		error = null;
	});

	function save(e: SubmitEvent): void {
		e.preventDefault();
		const seconds = parseDuration(when);
		if (seconds === null) {
			error = 'Type a time like 10 min, 1h 30m or 1:30:00.';
			return;
		}
		error = null;
		onsave({ ...(editing?.id !== undefined ? { id: editing.id } : {}), name, inSeconds: seconds });
		if (!editing) {
			name = '';
			when = '';
		}
	}
</script>

<form class="tools" onsubmit={save} data-testid="mc-alarm-form">
	<div class="row">
		<input
			type="text"
			placeholder="Alarm name"
			maxlength="80"
			bind:value={name}
			aria-label="Alarm name"
			data-testid="mc-alarm-name"
		/>
		<input
			type="text"
			placeholder="in 10 min"
			bind:value={when}
			aria-label="Time from now"
			data-testid="mc-alarm-in"
		/>
	</div>
	<div class="row">
		<Button type="submit" data-testid="mc-alarm-save">{editing ? 'Save alarm' : 'Add alarm'}</Button>
		{#if editing}<Button variant="ghost" onclick={() => oncancel?.()}>Cancel</Button>{/if}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</form>

{#if destinations.length > 0}
	<div class="tools" data-testid="mc-window">
		<label class="row">
			<span class="dim">Next window to</span>
			<select
				value={destination ?? ''}
				onchange={(e) => ondestination?.(e.currentTarget.value || null)}
				data-testid="mc-window-body"
			>
				<option value="">Choose a body</option>
				{#each destinations as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
			</select>
		</label>
		{#if typeof window === 'string'}
			<p class="dim">{window}</p>
		{:else if window}
			<p class="num" data-testid="mc-window-result">
				{window.date} · in {formatDuration(window.wait)} · {formatSpeed(window.dv)}
			</p>
			<Button onclick={() => onwindowalarm?.()} data-testid="mc-window-alarm">Alarm at window</Button>
			<p class="dim small">Circular, coplanar orbits; the date is not tracked after it is set.</p>
		{/if}
	</div>
{/if}

<style>
	.tools {
		display: grid;
		gap: var(--s-2);
		margin-top: var(--s-2);
		padding-top: var(--s-2);
		border-top: 1px solid var(--border-divider);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2);
	}
	input,
	select {
		flex: 1 1 6rem;
		min-width: 0;
		padding: 0.25rem 0.5rem;
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.dim {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.small {
		font-size: var(--t-xs);
	}
	.num {
		margin: 0;
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
	}
	.error {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--c-warning);
	}
</style>
