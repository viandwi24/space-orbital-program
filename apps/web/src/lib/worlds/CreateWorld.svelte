<script lang="ts">
	/**
	 * Create World (plan 087, ADRs 0094, 0111 and 0143): name, preset, star system, start date, gravity
	 * model, the primary site (plan 092: Default or a template resolved on the seed, with its
	 * consequences) and every rule, generated from the registries so a mod's rules appear here too. The form
	 * hands plain data to `createWorldInfo`, which validates it like a save.
	 */
	import type { RuleDefinition, RuleValue, WorldInfo } from '@orbital/core';
	import { untrack } from 'svelte';
	import Button from '../ui/Button.svelte';
	import Chip from '../ui/Chip.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Switch from '../ui/Switch.svelte';
	import type { WorldCatalog } from './catalog';
	import {
		createWorldInfo,
		formatLatLon,
		isCustom,
		isIdentityRule,
		presetRules,
		resolveSiteChoice,
		ruleGroups,
		startDatesFor,
		type StartDate
	} from './world-model';

	let {
		open,
		catalog,
		onclose,
		oncreate,
		now = () => Date.now(),
		newId,
		newSeed,
		initialSite = 'default'
	}: {
		open: boolean;
		catalog: WorldCatalog;
		onclose: () => void;
		oncreate: (world: WorldInfo, name: string, scenario?: string) => void | Promise<void>;
		now?: () => number;
		newId: () => string;
		newSeed: () => number;
		/** The site choice the dialog opens with: `default` or a template id. */
		initialSite?: string;
	} = $props();

	// The dialog is mounted when it opens, so its starting values are read once, on purpose.
	const initial = untrack(() => {
		const firstPreset = catalog.presets[0]?.id ?? '';
		return {
			preset: firstPreset,
			rules: presetRules(catalog, firstPreset),
			seed: newSeed(),
			starts: startDatesFor(catalog.calendar),
			groups: ruleGroups(catalog)
		};
	});
	let name = $state('New world');
	let preset = $state(initial.preset);
	let rules = $state<Record<string, RuleValue>>(initial.rules);
	let seed = $state(initial.seed);
	const starts = initial.starts;
	let start = $state<StartDate['kind']>(starts[0]!);
	let fixedDate = $state('2000-01-01');
	let gravity = $state('patched');
	let siteChoice = $state(untrack(() => initialSite));
	// Resolving reads the seed's terrain map once (about a second the first time, cached after).
	const resolved = $derived(
		siteChoice === 'default' ? null : resolveSiteChoice(catalog, siteChoice, seed)
	);
	const boundary = (d: string) =>
		d === 'sea' ? 'over the sea' : d === 'land' ? 'over land' : 'over land and sea';
	let problem = $state<string | null>(null);
	let busy = $state(false);

	const groups = initial.groups;
	const custom = $derived(isCustom(catalog, preset, rules));
	const presetOptions = $derived(
		catalog.presets.map((p) => ({
			value: p.id,
			label: p.id === preset && custom ? `${p.label} · Custom` : p.label,
			...(p.description ? { hint: p.description } : {})
		}))
	);
	const startLabels: Record<StartDate['kind'], string> = {
		'day-one': 'Day 1',
		today: 'Today',
		fixed: 'A date',
		j2000: 'J2000'
	};
	const allStarts: StartDate['kind'][] = ['today', 'fixed', 'j2000'];

	function choosePreset(id: string): void {
		preset = id;
		rules = presetRules(catalog, id);
	}
	// a mission pack sets the mode and its rules (plan 100, ADR 0151 point 4)
	let scenario = $state('');
	const chosenScenario = $derived(catalog.scenarios.find((s) => s.id === scenario));
	function chooseScenario(id: string): void {
		scenario = id;
		const s = catalog.scenarios.find((x) => x.id === id);
		if (!s) return;
		choosePreset(s.preset);
		rules = { ...rules, ...(s.rules ?? {}) };
	}
	const setRule = (id: string, value: RuleValue): void => {
		rules = { ...rules, [id]: value };
	};

	function startDate(): StartDate {
		if (start === 'fixed') {
			const [y, m, d] = fixedDate.split('-').map(Number);
			return { kind: 'fixed', year: y!, month: m!, day: d! };
		}
		return { kind: start } as StartDate;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const result = createWorldInfo(
			{
				id: newId(),
				seed,
				preset,
				rules,
				start: startDate(),
				gravityModel: gravity,
				systemId: catalog.system.id,
				systemVersion: catalog.system.version,
				variant: catalog.system.variants[0] ?? 'default',
				...(resolved
					? {
							site: {
								latitude: resolved.latitude,
								longitude: resolved.longitude,
								template: resolved.template
							}
						}
					: {})
			},
			catalog,
			catalog.calendar,
			now()
		);
		if (!result.ok) {
			problem = `This world cannot be created: ${result.reason}.`;
			return;
		}
		problem = null;
		busy = true;
		try {
			await oncreate(result.world, name, scenario || undefined);
		} finally {
			busy = false;
		}
	}

	const step = (rule: Extract<RuleDefinition, { type: 'number' }>): number =>
		rule.integer ? 1 : 0.1;
</script>

<Dialog {open} title="Create world" {onclose}>
	<form class="create" onsubmit={submit} data-testid="create-world">
		<label class="field">
			<span class="label">Name</span>
			<input type="text" bind:value={name} maxlength="48" required data-testid="world-name" />
		</label>

		{#if catalog.scenarios.length > 0}
			<label class="field">
				<span class="label">Start</span>
				<select
					value={scenario}
					onchange={(e) => chooseScenario(e.currentTarget.value)}
					data-testid="world-scenario"
				>
					<option value="">In the Hangar</option>
					{#each catalog.scenarios as s (s.id)}
						<option value={s.id}>{s.title}</option>
					{/each}
				</select>
				{#if chosenScenario}<p class="note">{chosenScenario.description}</p>{/if}
			</label>
		{/if}

		<div class="field">
			<span class="label">Mode</span>
			<Segmented
				label="Mode"
				value={preset}
				options={presetOptions}
				onchange={choosePreset}
				testid="world-preset"
			/>
			{#if custom}<p class="note" data-testid="world-custom">
					Custom: some rules differ from the preset.
				</p>{/if}
		</div>

		<div class="row">
			<label class="field">
				<span class="label">Star system</span>
				<select disabled data-testid="world-system">
					<option>{catalog.system.label}</option>
				</select>
			</label>
			<label class="field">
				<span class="label">Seed</span>
				<input
					type="number"
					bind:value={seed}
					min="0"
					max="4294967295"
					step="1"
					data-testid="world-seed"
				/>
			</label>
		</div>

		<fieldset class="field">
			<legend class="label">Start date</legend>
			{#if starts.includes('day-one')}
				<div class="radios">
					<label><input type="radio" name="start" value="day-one" bind:group={start} /> Day 1</label
					>
					{#each allStarts as kind (kind)}
						<label class="off"
							><input type="radio" name="start" value={kind} disabled /> {startLabels[kind]}</label
						>
					{/each}
				</div>
				<p class="note">This star system has its own calendar: worlds start on day 1.</p>
			{:else}
				<div class="radios">
					{#each starts as kind (kind)}
						<label
							><input type="radio" name="start" value={kind} bind:group={start} />
							{startLabels[kind]}</label
						>
					{/each}
				</div>
				{#if start === 'fixed'}
					<input type="date" bind:value={fixedDate} aria-label="Start date" />
				{/if}
			{/if}
		</fieldset>

		<fieldset class="field" data-testid="site-choice">
			<legend class="label">Site</legend>
			<div class="radios">
				<label>
					<input type="radio" name="site" value="default" bind:group={siteChoice} />
					Default (0°, 0°)
				</label>
				{#each catalog.siteTemplates as t (t.id)}
					<label>
						<input type="radio" name="site" value={t.id} bind:group={siteChoice} />
						{t.label}
					</label>
				{/each}
			</div>
			{#if resolved}
				<dl class="consequences" data-testid="site-consequences">
					<dt>Place</dt>
					<dd class="num">{formatLatLon(resolved.latitude, resolved.longitude)}</dd>
					<dt>Rotation boost</dt>
					<dd class="num">{resolved.consequences.rotationBoost.toFixed(0)} m/s</dd>
					<dt>Lowest inclination</dt>
					<dd class="num">
						{((resolved.consequences.minInclination * 180) / Math.PI).toFixed(1)}°
					</dd>
					<dt>Downrange east</dt>
					<dd>{boundary(resolved.consequences.downrange)}</dd>
				</dl>
				{#if resolved.relaxed.length > 0}
					<p class="note">
						No spot on this world meets every wish; dropped: {resolved.relaxed.join(', ')}.
					</p>
				{/if}
			{:else}
				<p class="note">
					The Space Center at latitude 0°, longitude 0°: the most rotation boost, every inclination.
				</p>
			{/if}
		</fieldset>

		<fieldset class="field">
			<legend class="label">Gravity</legend>
			<div class="radios">
				<label>
					<input
						type="radio"
						name="gravity"
						value="patched"
						bind:group={gravity}
						data-testid="gravity-patched"
					/>
					Patched conics
				</label>
				<label class="off">
					<input type="radio" name="gravity" value="n-body" disabled data-testid="gravity-n-body" />
					N-body <Chip outline>Coming soon</Chip>
				</label>
			</div>
			<p class="note">N-body: every body pulls on every vessel. It comes after version 1.</p>
		</fieldset>

		{#each groups as group (group.category)}
			<fieldset class="field group" data-testid="rules-{group.category}">
				<legend class="label">{group.category}</legend>
				{#each group.rules as rule (rule.id)}
					<div class="rule">
						<div class="what">
							<span class="name">{rule.label}</span>
							{#if isIdentityRule(rule)}<Chip outline>Fixed for this world</Chip>{/if}
							{#if rule.description}<span class="hint">{rule.description}</span>{/if}
						</div>
						{#if rule.type === 'boolean'}
							<Switch
								checked={rules[rule.id] === true}
								label={rule.label}
								onchange={(on) => setRule(rule.id, on)}
								testid="rule-{rule.id}"
							/>
						{:else if rule.type === 'enum'}
							<select
								aria-label={rule.label}
								value={String(rules[rule.id])}
								onchange={(e) => setRule(rule.id, e.currentTarget.value)}
								data-testid="rule-{rule.id}"
							>
								{#each rule.values as v (v)}<option value={v}>{v}</option>{/each}
							</select>
						{:else}
							<input
								type="number"
								aria-label={rule.label}
								min={rule.min}
								max={rule.max}
								step={step(rule)}
								value={Number(rules[rule.id])}
								onchange={(e) => setRule(rule.id, Number(e.currentTarget.value))}
								data-testid="rule-{rule.id}"
							/>
						{/if}
					</div>
				{/each}
			</fieldset>
		{/each}

		<p class="note">
			Installed mods are active in every world; manage them from Mods on the home screen.
		</p>
		{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
		<div class="actions">
			<Button variant="ghost" onclick={onclose}>Cancel</Button>
			<Button variant="primary" type="submit" disabled={busy} data-testid="world-create"
				>Create world</Button
			>
		</div>
	</form>
</Dialog>

<style>
	.create {
		display: grid;
		gap: var(--s-4);
		min-width: min(560px, calc(100vw - 80px));
	}
	.field {
		display: grid;
		gap: var(--s-2);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--s-3);
	}
	.label {
		padding: 0;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	input[type='text'],
	input[type='number'],
	input[type='date'],
	select {
		min-height: var(--round-btn);
		padding: 0 var(--s-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-body);
	}
	.radios {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-4);
	}
	.radios label {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
	.off {
		color: var(--text-muted);
	}
	.group {
		padding-top: var(--s-2);
		border-top: 1px solid var(--border-divider);
	}
	.rule {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-1) var(--s-2);
		min-width: 0;
	}
	.name {
		font-weight: 600;
		color: var(--text-primary);
	}
	.hint {
		flex-basis: 100%;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.consequences {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--s-1) var(--s-3);
		margin: var(--s-2) 0 0;
	}
	.consequences dt {
		color: var(--text-dim);
	}
	.consequences dd {
		margin: 0;
	}
	.note {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.problem {
		margin: 0;
		color: var(--danger);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-2);
	}
</style>
