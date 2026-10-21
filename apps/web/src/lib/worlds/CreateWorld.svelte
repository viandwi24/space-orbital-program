<script lang="ts">
	/**
	 * Create World (plan 087, ADRs 0094, 0111 and 0143; a full page since plan 317, V3_CHANGES §4):
	 * three steps — Mode, World, Rules — and a summary that is always shown, so Create works from any
	 * step. Every choice comes from the registries (presets, systems, site templates, rules), so a mod's
	 * appear without UI work; their pictures are generated or the mod's own (ADR 0273). The page hands
	 * plain data to `createWorldInfo`, which validates it like a save.
	 */
	import {
		homeBodyOf,
		type PresetDefinition,
		type RuleDefinition,
		type RuleValue,
		type WorldInfo
	} from '@orbital/core';
	import { untrack } from 'svelte';
	import type { WorldCatalog } from './catalog';
	import { modeArt, withAlpha } from './mode-art';
	import SystemArt from './SystemArt.svelte';
	import {
		createWorldInfo,
		formatLatLon,
		isIdentityRule,
		presetRules,
		resolveSiteChoice,
		ruleGroups,
		startDatesFor,
		type StartDate
	} from './world-model';

	type Step = 'mode' | 'world' | 'rules';

	let {
		open,
		catalog,
		onclose,
		oncreate,
		now = () => Date.now(),
		newId,
		newSeed,
		initialSite = 'default',
		initialStep = 'mode',
		initialCategory
	}: {
		open: boolean;
		catalog: WorldCatalog;
		onclose: () => void;
		oncreate: (world: WorldInfo, name: string, scenario?: string) => void | Promise<void>;
		now?: () => number;
		newId: () => string;
		newSeed: () => number;
		/** The site choice the page opens with: `default` or a template id. */
		initialSite?: string;
		/** The step it opens on (the tests and the design's frames). */
		initialStep?: Step;
		/** The rule category the Rules step opens on; absent: the first. */
		initialCategory?: string;
	} = $props();

	// The page is mounted when it opens, so its starting values are read once, on purpose.
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
	let step = $state<Step>(untrack(() => initialStep));
	let name = $state('New world');
	let preset = $state(initial.preset);
	let rules = $state<Record<string, RuleValue>>(initial.rules);
	let seed = $state(initial.seed);
	const base = $derived(presetRules(catalog, preset));
	const changed = $derived(catalog.rules.filter((r) => rules[r.id] !== base[r.id]));
	const currentPreset = $derived(catalog.presets.find((p) => p.id === preset));

	// The star system (plan 124, ADR 0184): its bodies, calendar and variants drive the rest.
	let systemId = $state(untrack(() => catalog.systems[0]?.id ?? catalog.system.id));
	const active = $derived(catalog.systems.find((s) => s.id === systemId) ?? catalog.systems[0]!);
	let variant = $state(untrack(() => catalog.systems[0]?.variants[0]?.variant ?? 'default'));
	const starts = $derived(startDatesFor(active.calendar));
	let start = $state<StartDate['kind']>(untrack(() => initial.starts[0]!));
	function chooseSystem(id: string): void {
		systemId = id;
		const next = catalog.systems.find((s) => s.id === id);
		variant = next?.variants[0]?.variant ?? 'default';
		start = startDatesFor(next?.calendar ?? catalog.calendar)[0]!;
		siteChoice = 'default';
	}
	const chosenVariant = $derived(active.variants.find((v) => v.variant === variant));
	/** `Δv to orbit ≈ 9.4 km/s · Moon in 4.9 days`, from the pack's data. */
	const factsText = (f: NonNullable<(typeof active.variants)[number]['facts']>): string =>
		`Δv to orbit ≈ ${(f.dvToOrbit / 1000).toFixed(1)} km/s` +
		(f.moonTransfer === undefined ? '' : ` · Moon in ${(f.moonTransfer / 86_400).toFixed(1)} days`);
	let fixedDate = $state('2000-01-01');
	let gravity = $state('patched');
	let siteChoice = $state(untrack(() => initialSite));
	// Resolving reads the seed's terrain map once (about a second the first time, cached after).
	const resolved = $derived(
		siteChoice === 'default'
			? null
			: resolveSiteChoice({ ...catalog, bodies: active.bodies }, siteChoice, seed)
	);
	const boundary = (d: string) =>
		d === 'sea' ? 'over the sea' : d === 'land' ? 'over land' : 'over land and sea';
	let problem = $state<string | null>(null);
	let busy = $state(false);

	const groups = initial.groups;
	let category = $state(untrack(() => initialCategory ?? initial.groups[0]?.category ?? ''));
	const shownGroup = $derived(groups.find((g) => g.category === category) ?? groups[0]);
	const startLabels: Record<StartDate['kind'], string> = {
		'day-one': 'Day 1',
		today: 'Today',
		fixed: 'A date',
		j2000: 'J2000'
	};
	const allStarts: StartDate['kind'][] = ['day-one', 'today', 'fixed', 'j2000'];

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
				systemId: active.id,
				systemVersion: active.version,
				variant,
				home: homeBodyOf(active.bodies)?.id,
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
			active.calendar,
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

	const numberStep = (rule: Extract<RuleDefinition, { type: 'number' }>): number =>
		rule.integer ? 1 : 0.1;
	const art = (p: PresetDefinition) => modeArt(p.id);
	const modeColor = $derived(modeArt(preset).color);

	/** The summary's key rules (V3 §4.5): the stock ones that are loaded; off ones struck through. */
	const KEY = [
		'stock.economy',
		'stock.contracts',
		'stock.tech-tree',
		'stock.comms',
		'stock.crew-death',
		'stock.life-support',
		'stock.allow-revert',
		'stock.allow-quickload',
		'stock.reliability'
	];
	const ruleOn = (v: RuleValue | undefined): boolean =>
		v === true ||
		(typeof v === 'string' && v !== 'off' && v !== 'none') ||
		(typeof v === 'number' && v > 0);
	const keyRules = $derived(
		KEY.flatMap((id) => {
			const r = catalog.rules.find((x) => x.id === id);
			if (!r) return [];
			const v = rules[id];
			const label = r.type === 'enum' ? `${r.label} · ${String(v)}` : r.label;
			return [{ id, label, on: ruleOn(v) }];
		})
	);
	const fixedRules = $derived(catalog.rules.filter(isIdentityRule).map((r) => r.label));
	const groupStats = (g: (typeof groups)[number]): string => {
		const switches = g.rules.filter((r) => r.type === 'boolean');
		const n = g.rules.filter((r) => rules[r.id] !== base[r.id]).length;
		const on = switches.filter((r) => rules[r.id] === true).length;
		return (
			(switches.length ? `${on} of ${switches.length} on` : `${g.rules.length} settings`) +
			(n ? ` · ${n} changed` : '')
		);
	};
	const CATEGORY_ICONS: Record<string, string> = {
		economy: 'M12 3 V21 M16 7 H10 A3 3 0 0 0 10 13 H14 A3 3 0 0 1 14 19 H8',
		science:
			'M9 3 H15 M10 3 V9 L4.5 19 A1.5 1.5 0 0 0 6 21 H18 A1.5 1.5 0 0 0 19.5 19 L14 9 V3 M7 15 H17',
		crew: 'M9 5 A3 3 0 1 1 8.99 5 Z M3 20 C3 16 6 14 9 14 C12 14 15 16 15 20 M16 5.5 A2.5 2.5 0 1 1 15.99 5.5 Z M17 13.5 C19.5 14 21 16 21 19',
		comms: 'M4 6 A11 11 0 0 0 16 18 Z M10 12 L17 5 M12 21 H20 M16 18 V21',
		launch: 'M12 2 C15 5 16 9 16 13 L18 17 H6 L8 13 C8 9 9 5 12 2 Z M10 17 L9.5 21 M14 17 L14.5 21',
		agency: 'M3 21 H21 M5 21 V10 M9 21 V10 M15 21 V10 M19 21 V10 M3 10 L12 4 L21 10 Z',
		world: 'M12 3 A9 9 0 1 1 11.99 3 Z M3 12 H21 M12 3 C8 7 8 17 12 21 C16 17 16 7 12 3'
	};
	const categoryIcon = (c: string) => CATEGORY_ICONS[c] ?? 'M5 5 H19 V19 H5 Z M9 12 H15';
	const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

	// the launch-site globe (V3 §4.3): an orthographic view with the chosen site's pin
	const G = { cx: 180, cy: 180, r: 150 };
	const deg = Math.PI / 180;
	const globeLines = [-60, -30, 0, 30, 60].flatMap((v) => {
		const y = G.cy - G.r * Math.sin(v * deg);
		const rx = G.r * Math.cos(v * deg);
		const lon = Math.abs(G.r * Math.sin(v * deg));
		return [
			`M${(G.cx - rx).toFixed(1)} ${y.toFixed(1)} H${(G.cx + rx).toFixed(1)}`,
			v === 0 ? 'M180 30 V330' : `M180 30 A${lon.toFixed(1)} 150 0 0 ${v > 0 ? 1 : 0} 180 330`
		];
	});
	/** Latitude and longitude (rad) on the globe's face. */
	const pinAt = (lat: number, lon: number) => ({
		x: G.cx + G.r * Math.cos(lat) * Math.sin(lon),
		y: G.cy - G.r * Math.sin(lat)
	});
	const pin = $derived(resolved ? pinAt(resolved.latitude, resolved.longitude) : pinAt(0, 0));
	const siteName = $derived(
		siteChoice === 'default'
			? 'Default (0°, 0°)'
			: (catalog.siteTemplates.find((t) => t.id === siteChoice)?.label ?? siteChoice)
	);
	const criteriaText = (t: (typeof catalog.siteTemplates)[number]): string => {
		const [a, b] = t.criteria.absLatitude;
		return `|lat| ${(a / deg).toFixed(0)}–${(b / deg).toFixed(0)}°`;
	};

	const ORDER: Step[] = ['mode', 'world', 'rules'];
	const LABEL: Record<Step, string> = { mode: 'Mode', world: 'World', rules: 'Rules' };
	const HINT: Record<Step, string> = {
		mode: 'Step 1 of 3 · Name your world and pick how you want to play.',
		world: 'Step 2 of 3 · Where and when your program starts.',
		rules: 'Step 3 of 3 · Fine-tune the rules, or create the world as it is.'
	};
	const index = $derived(ORDER.indexOf(step));
	function onkey(e: KeyboardEvent): void {
		if (open && e.key === 'Escape' && !e.defaultPrevented) onclose();
	}
</script>

<svelte:window onkeydown={onkey} />

{#if open}
	<div class="page" style:--mode={modeColor} style:--mode-glow={withAlpha(modeColor, 0.13)}>
		<div class="glow" aria-hidden="true"></div>
		<form class="create" onsubmit={submit} data-testid="create-world" aria-label="Create world">
			<header class="top">
				<button
					type="button"
					class="round"
					aria-label="Cancel and go back to Worlds"
					data-tip="Cancel"
					onclick={onclose}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d="M6 6 L18 18 M18 6 L6 18" /></svg
					></button
				>
				<h1>Create world</h1>
				<nav class="steps" aria-label="Steps">
					{#each ORDER as s, i (s)}
						<button
							type="button"
							class="step"
							class:on={s === step}
							class:done={i < index}
							aria-current={s === step ? 'step' : undefined}
							data-testid="create-step-{s}"
							onclick={() => (step = s)}
							><span class="n">{i < index ? '✓' : i + 1}</span>{LABEL[s]}</button
						>
					{/each}
				</nav>
			</header>

			<div class="body">
				{#if step === 'mode'}
					<section class="mode" aria-label="Mode">
						<label class="name">
							<span class="cap">World name</span>
							<input
								type="text"
								bind:value={name}
								maxlength="48"
								required
								placeholder="Name your world"
								data-testid="world-name"
							/>
						</label>
						<div class="block">
							<div class="head">
								<span class="cap">Mode</span>
								<span class="hint"
									>Sets a preset of rules. You can change any of them in Rules.</span
								>
							</div>
							<div class="modes" role="radiogroup" aria-label="Mode" data-testid="world-preset">
								{#each catalog.presets as p (p.id)}
									{@const a = art(p)}
									<button
										type="button"
										role="radio"
										class="mcard"
										aria-checked={p.id === preset}
										aria-label={p.label}
										data-testid="world-preset-{p.id}"
										style:--c-soft={withAlpha(a.color, p.id === preset ? 0.2 : 0.12)}
										onclick={() => choosePreset(p.id)}
									>
										<span class="art">
											{#if p.illustration}
												<img src={p.illustration} alt="" />
											{:else}
												<svg viewBox="0 0 240 150" aria-hidden="true">
													{#each a.paths as path, k (k)}
														<path
															d={path.d}
															stroke={path.stroke}
															stroke-width={path.width}
															fill={path.fill}
															stroke-dasharray={path.dash}
														/>
													{/each}
												</svg>
											{/if}
										</span>
										<span class="mname">{p.label}</span>
										{#if p.description}<span class="mdesc">{p.description}</span>{/if}
										<span class="dot" aria-hidden="true"></span>
									</button>
								{/each}
							</div>
						</div>
						<div class="strip">
							<span class="cap">{currentPreset?.label ?? 'Preset'} preset</span>
							<span class="lines">
								{#each keyRules as k (k.id)}
									<span class="line" class:on={k.on}>{k.on ? '●' : '○'} {k.label}</span>
								{/each}
							</span>
							<button type="button" class="soft" onclick={() => (step = 'rules')}
								>Customize rules →</button
							>
						</div>
						{#if changed.length > 0}<p class="note" data-testid="world-custom">
								Custom: {changed.length}
								{changed.length === 1 ? 'rule differs' : 'rules differ'} from the preset.
							</p>{/if}
						{#if catalog.scenarios.length > 0}
							<label class="field">
								<span class="cap">Start</span>
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
								{#if chosenScenario}<span class="hint">{chosenScenario.description}</span>{/if}
							</label>
						{/if}
					</section>
				{:else if step === 'world'}
					<section class="world" aria-label="World">
						<div class="col">
							<fieldset class="block">
								<legend class="cap">Star system</legend>
								<div class="systems" data-testid="world-system">
									{#each catalog.systems as s (s.id)}
										<label class="card scard" class:on={s.id === systemId}>
											<input
												type="radio"
												name="system"
												value={s.id}
												checked={s.id === systemId}
												class="sr-only"
												data-testid="world-system-{s.id}"
												onchange={() => chooseSystem(s.id)}
											/>
											<SystemArt
												systemId={s.id}
												bodies={s.bodies}
												image={s.illustration}
												label="{s.label}: its star and planets"
											/>
											<span class="sname">{s.label}</span>
											<span class="sdesc"
												>{s.bodies.length} bodies{s.variants.length > 1
													? ` · ${s.variants.length} scales`
													: ''}</span
											>
											<span class="dot" aria-hidden="true"></span>
										</label>
									{/each}
								</div>
							</fieldset>
							{#if active.variants.length > 1 || chosenVariant?.facts}
								<fieldset class="block" data-testid="world-variants">
									<legend class="cap">Scale</legend>
									<div class="variants">
										{#each active.variants as v (v.variant)}
											<label
												class="card variant"
												class:on={v.variant === variant}
												data-testid="world-variant-{v.variant}"
											>
												<input
													type="radio"
													name="variant"
													value={v.variant}
													bind:group={variant}
													class="sr-only"
												/>
												<span class="sname">{v.label}</span>
												{#if v.facts}<span class="facts">{factsText(v.facts)}</span>{/if}
												{#if v.description}<span class="sdesc">{v.description}</span>{/if}
											</label>
										{/each}
									</div>
								</fieldset>
							{/if}
							<div class="pair">
								<fieldset class="block">
									<legend class="cap">Start date</legend>
									<div class="seg" role="radiogroup" aria-label="Start date">
										{#each allStarts as kind (kind)}
											<label
												class="segbtn"
												class:on={start === kind}
												class:off={!starts.includes(kind)}
											>
												<input
													type="radio"
													name="start"
													value={kind}
													bind:group={start}
													disabled={!starts.includes(kind)}
													class="sr-only"
												/>{startLabels[kind]}</label
											>
										{/each}
									</div>
									{#if start === 'fixed'}
										<input
											type="date"
											class="date"
											bind:value={fixedDate}
											aria-label="Start date"
										/>
									{/if}
									<span class="hint"
										>{starts.includes('day-one')
											? 'This star system has its own calendar: worlds start on day 1.'
											: 'This system uses the real calendar: Today, a date or J2000 set the planets’ positions.'}</span
									>
								</fieldset>
								<label class="block">
									<span class="cap">Seed</span>
									<span class="seed">
										<input
											type="number"
											bind:value={seed}
											min="0"
											max="4294967295"
											step="1"
											data-testid="world-seed"
										/>
										<button
											type="button"
											class="dice"
											aria-label="Random seed"
											data-tip="Random seed"
											onclick={() => (seed = newSeed())}
											><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
												><path
													d="M4 4 H20 V20 H4 Z M8.5 8.5 H8.51 M15.5 8.5 H15.51 M12 12 H12.01 M8.5 15.5 H8.51 M15.5 15.5 H15.51"
												/></svg
											></button
										>
									</span>
								</label>
							</div>
							<fieldset class="block">
								<legend class="cap">Gravity</legend>
								<div class="gravities">
									<label class="card grav" class:on={gravity === 'patched'}>
										<input
											type="radio"
											name="gravity"
											value="patched"
											bind:group={gravity}
											class="sr-only"
											data-testid="gravity-patched"
										/>
										<svg viewBox="0 0 84 84" aria-hidden="true">
											<circle cx="42" cy="42" r="10" class="g-body" />
											<circle cx="42" cy="42" r="30" class="g-soi" />
											<ellipse cx="42" cy="42" rx="24" ry="14" class="g-orbit" />
										</svg>
										<span class="gtext">
											<span class="sname">Patched conics</span>
											<span class="sdesc"
												>One body pulls at a time. Predictable orbits and full time warp.</span
											>
										</span>
									</label>
									<label class="card grav" class:on={gravity === 'n-body'}>
										<input
											type="radio"
											name="gravity"
											value="n-body"
											bind:group={gravity}
											class="sr-only"
											data-testid="gravity-n-body"
										/>
										<svg viewBox="0 0 84 84" aria-hidden="true">
											<circle cx="30" cy="46" r="9" class="g-body" />
											<circle cx="62" cy="26" r="5" class="g-moon" />
											<path d="M14 70 C30 20 70 70 74 40" class="g-orbit" />
											<path d="M40 40 L56 30 M46 54 L58 66" class="g-soi" />
										</svg>
										<span class="gtext">
											<span class="sname">N-body</span>
											<span class="sdesc"
												>Every body pulls on every vessel: Lagrange points and perturbed orbits.
												Warp is held lower.</span
											>
										</span>
									</label>
								</div>
							</fieldset>
						</div>
						<fieldset class="col site" data-testid="site-choice">
							<legend class="cap">Launch site</legend>
							<div class="globe">
								<svg
									viewBox="0 0 360 360"
									role="img"
									aria-label="Globe with the chosen launch site"
								>
									<circle cx="180" cy="180" r="150" class="sea" />
									{#each globeLines as l, i (i)}<path d={l} class="grid" />{/each}
									<circle cx={pin.x} cy={pin.y} r="11" class="halo" />
									<circle cx={pin.x} cy={pin.y} r="5" class="pin" />
								</svg>
								<span
									class="tag"
									style:left="calc(50% + {pin.x - 180 + 16}px)"
									style:top="calc(50% + {pin.y - 190}px)">{siteName}</span
								>
							</div>
							<div class="sites">
								<label class="srow" class:on={siteChoice === 'default'}>
									<input
										type="radio"
										name="site"
										value="default"
										bind:group={siteChoice}
										class="sr-only"
									/>
									<span class="sname">Default (0°, 0°)</span>
									<span class="coords">0° N · 0° E</span>
								</label>
								{#each catalog.siteTemplates as t (t.id)}
									<label class="srow" class:on={siteChoice === t.id}>
										<input
											type="radio"
											name="site"
											value={t.id}
											bind:group={siteChoice}
											class="sr-only"
										/>
										<span class="sname">{t.label}</span>
										<span class="coords"
											>{siteChoice === t.id && resolved
												? formatLatLon(resolved.latitude, resolved.longitude)
												: criteriaText(t)}</span
										>
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
									<p class="hint">
										No spot on this world meets every wish; dropped: {resolved.relaxed.join(', ')}.
									</p>
								{/if}
							{:else}
								<p class="hint">
									The Space Center at latitude 0°, longitude 0°: the most rotation boost, every
									inclination.
								</p>
							{/if}
						</fieldset>
					</section>
				{:else}
					<section class="rules" aria-label="Rules">
						<div class="cats">
							<div role="tablist" aria-orientation="vertical" aria-label="Rule categories">
								{#each groups as g (g.category)}
									<button
										type="button"
										role="tab"
										class="cat"
										aria-selected={g.category === shownGroup?.category}
										data-testid="rules-{g.category}"
										onclick={() => (category = g.category)}
									>
										<span class="cico"
											><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
												><path d={categoryIcon(g.category)} /></svg
											></span
										>
										<span class="ctext">
											<span class="cname">{title(g.category)}</span>
											<span class="csub">{groupStats(g)}</span>
										</span>
										<span class="dot" aria-hidden="true"></span>
									</button>
								{/each}
							</div>
							<p class="hint box">
								Installed mods are active in every world; manage them from Mods on the home screen.
							</p>
						</div>
						{#if shownGroup}
							<div class="rows" role="tabpanel" aria-label={title(shownGroup.category)}>
								<div class="rhead">
									<h2>{title(shownGroup.category)}</h2>
									<span class="changed"
										>{changed.length
											? `${changed.length} changed from the ${currentPreset?.label ?? ''} preset`
											: `Using the ${currentPreset?.label ?? ''} preset`}</span
									>
									{#if changed.length}<button
											type="button"
											class="soft"
											data-testid="rules-reset"
											onclick={() => (rules = presetRules(catalog, preset))}>Reset to preset</button
										>{/if}
								</div>
								{#each shownGroup.rules as rule (rule.id)}
									<div class="rule">
										<div class="what">
											<span class="rname"
												>{rule.label}{#if rules[rule.id] !== base[rule.id]}<span
														class="cdot"
														role="img"
														aria-label="changed from the preset"
													></span>{/if}{#if isIdentityRule(rule)}<span class="fixed"
														><svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true"
															><path
																d="M6 11 H18 V20 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11"
															/></svg
														>Fixed for this world</span
													>{/if}</span
											>
											{#if rule.description}<span class="rdesc">{rule.description}</span>{/if}
										</div>
										{#if rule.type === 'boolean'}
											<button
												type="button"
												role="switch"
												class="switch"
												aria-checked={rules[rule.id] === true}
												aria-label={rule.label}
												data-testid="rule-{rule.id}"
												onclick={() => setRule(rule.id, rules[rule.id] !== true)}
												><span class="knob"></span></button
											>
										{:else if rule.type === 'enum' && rule.values.length <= 3}
											<div
												class="seg"
												role="radiogroup"
												aria-label={rule.label}
												data-testid="rule-{rule.id}"
											>
												{#each rule.values as v (v)}
													<button
														type="button"
														role="radio"
														class="segbtn"
														class:on={rules[rule.id] === v}
														aria-checked={rules[rule.id] === v}
														onclick={() => setRule(rule.id, v)}>{v}</button
													>
												{/each}
											</div>
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
												class="numin"
												aria-label={rule.label}
												min={rule.min}
												max={rule.max}
												step={numberStep(rule)}
												value={Number(rules[rule.id])}
												onchange={(e) => setRule(rule.id, Number(e.currentTarget.value))}
												data-testid="rule-{rule.id}"
											/>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}
			</div>

			<div class="nav">
				<span class="hint">{HINT[step]}</span>
				{#if index > 0}<button
						type="button"
						class="ghost"
						onclick={() => (step = ORDER[index - 1]!)}>Back</button
					>{/if}
				{#if index < 2}<button
						type="button"
						class="next"
						data-testid="create-next"
						onclick={() => (step = ORDER[index + 1]!)}>Next: {LABEL[ORDER[index + 1]!]}</button
					>{/if}
			</div>

			<!-- the summary (V3 §4.5), always shown: Create works from any step -->
			<aside class="summary" aria-label="World summary">
				<div class="shead">
					<span class="planet" aria-hidden="true"></span>
					<span class="shade" aria-hidden="true"></span>
					<span class="chips">
						<span class="chip">{(currentPreset?.label ?? '').toUpperCase()}</span>
						<span class="chip">{active.label.toUpperCase()}</span>
					</span>
					<span class="sumname">{name || 'Untitled world'}</span>
				</div>
				<div class="sbody">
					<dl class="facts">
						<div>
							<dt>Star system</dt>
							<dd>{active.label}</dd>
						</div>
						{#if active.variants.length > 1}<div>
								<dt>Scale</dt>
								<dd>{chosenVariant?.label}</dd>
							</div>{/if}
						<div>
							<dt>Launch site</dt>
							<dd>{siteName}</dd>
						</div>
						<div>
							<dt>Start date</dt>
							<dd>{start === 'fixed' ? fixedDate : startLabels[start]}</dd>
						</div>
						<div>
							<dt>Gravity</dt>
							<dd>{gravity === 'n-body' ? 'N-body' : 'Patched conics'}</dd>
						</div>
						<div>
							<dt>Seed</dt>
							<dd class="num">{seed}</dd>
						</div>
					</dl>
					{#if keyRules.length > 0}
						<div class="keys">
							<span class="cap">Key rules</span>
							<span class="krow">
								{#each keyRules as k (k.id)}<span class="krule" class:off={!k.on}>{k.label}</span
									>{/each}
							</span>
						</div>
					{/if}
					{#if fixedRules.length > 0}
						<p class="lock">
							<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
								><path d="M6 11 H18 V20 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11" /></svg
							>
							<span>Fixed after creation: <b>{fixedRules.join(' · ')}</b>.</span>
						</p>
					{/if}
					{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
					<div class="go">
						<button type="submit" class="create-btn" disabled={busy} data-testid="world-create"
							>Create world <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
								><path d="M5 12 H19 M13 6 L19 12 L13 18" /></svg
							></button
						>
						<button type="button" class="cancel" onclick={onclose}>Cancel</button>
					</div>
				</div>
			</aside>
		</form>
	</div>
{/if}

<style>
	/* V3_CHANGES §4: a full page, the steps at the top centre, the summary at the right */
	.page {
		position: fixed;
		inset: 0;
		z-index: 40;
		overflow: auto;
		background: #03050a;
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.glow {
		position: fixed;
		right: -26rem;
		top: -14rem;
		width: 81rem;
		height: 81rem;
		border-radius: 50%;
		background: radial-gradient(circle, var(--mode-glow) 0%, rgb(3 5 10 / 0) 60%);
		transition: background 400ms ease;
		pointer-events: none;
	}
	.create {
		position: relative;
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 25rem;
		grid-template-rows: auto 1fr auto;
		gap: 2rem 2.5rem;
		padding: 2rem 3rem 2rem 4rem;
	}
	.top {
		grid-column: 1 / -1;
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		height: 2.75rem;
		margin-left: -1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.round {
		flex: none;
		width: 2.75rem;
		height: 2.75rem;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 50%;
		border: 1px solid var(--border-subtle);
		background: var(--surface-glass);
		color: var(--text-primary);
		cursor: pointer;
	}
	.round svg,
	.dice svg,
	.cico svg,
	.lock svg,
	.fixed svg,
	.create-btn svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.steps {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		height: 2.75rem;
		box-sizing: border-box;
		padding: 4px;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.step {
		height: 2.125rem;
		padding: 0 1rem 0 0.375rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-subtle);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}
	.step.done {
		color: var(--text-primary);
	}
	.step.on {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.n {
		width: 1.375rem;
		height: 1.375rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.1);
		color: var(--text-secondary);
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.step.on .n {
		background: var(--selected-fg);
		color: #fff;
	}
	.body {
		grid-column: 1;
		min-width: 0;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.hint {
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-subtle);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend.cap {
		padding: 0;
		margin-bottom: 0.75rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
	}
	/* step 1 · mode */
	.mode {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	.name {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		max-width: 47.5rem;
	}
	.name input {
		height: 4rem;
		padding: 0 2px;
		border: 0;
		border-bottom: 1px solid rgb(255 255 255 / 0.22);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: 2.5rem;
		font-weight: 300;
		outline: none;
	}
	.name input:focus-visible {
		border-bottom-color: var(--text-primary);
	}
	.modes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: 1rem;
	}
	.mcard {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.625rem 0.625rem 1rem;
		border-radius: 20px;
		border: 2px solid rgb(255 255 255 / 0.06);
		background: var(--surface-glass);
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background 160ms ease;
	}
	.mcard[aria-checked='true'] {
		border-color: #fff;
		background: rgb(255 255 255 / 0.07);
	}
	.mcard .art {
		display: grid;
		place-items: center;
		height: 10.625rem;
		border-radius: 14px;
		background: radial-gradient(circle at 50% 40%, var(--c-soft), rgb(255 255 255 / 0.02) 70%);
		overflow: hidden;
	}
	.mcard .art svg {
		width: 100%;
		max-width: 13.75rem;
		height: auto;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.mcard .art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.mname {
		padding: 0 4px;
		font-size: 1.125rem;
		line-height: 1.1;
		font-weight: 600;
		color: var(--text-primary);
	}
	.mdesc {
		padding: 0 4px;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.dot {
		position: absolute;
		right: 1.125rem;
		top: 1.125rem;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	[aria-checked='true'] > .dot,
	.on > .dot,
	[aria-selected='true'] > .dot {
		background: #fff;
	}
	.strip {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 1.125rem 1.25rem;
		border-radius: 16px;
		background: rgb(255 255 255 / 0.04);
		border: 1px solid rgb(255 255 255 / 0.06);
	}
	.strip .cap {
		white-space: nowrap;
	}
	.lines {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.line {
		height: 1.5rem;
		padding: 0 0.625rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--text-disabled);
	}
	.line.on {
		background: rgb(255 255 255 / 0.08);
		color: var(--text-primary);
	}
	.soft {
		margin-left: auto;
		flex: none;
		height: 2rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.08);
		color: var(--text-primary);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.note {
		margin: 0;
		font-size: 0.75rem;
		color: var(--warn);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 30rem;
	}
	select,
	.date,
	.numin,
	.seed input {
		height: 2.5rem;
		box-sizing: border-box;
		padding: 0 0.75rem;
		border-radius: 10px;
		border: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(255 255 255 / 0.04);
		color: var(--text-primary);
		font: inherit;
		font-size: 0.875rem;
	}
	/* step 2 · world */
	/* two columns only where the globe has room beside the choices (V3 §4.3); else it goes below */
	.world {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.5rem;
	}
	@media (min-width: 1700px) {
		.world {
			grid-template-columns: minmax(0, 41rem) minmax(0, 1fr);
		}
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 1.625rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.systems,
	.gravities,
	.variants {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.75rem;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem;
		border-radius: 16px;
		border: 2px solid rgb(255 255 255 / 0.06);
		background: rgb(255 255 255 / 0.03);
		cursor: pointer;
	}
	.card.on {
		border-color: #fff;
		background: rgb(255 255 255 / 0.07);
	}
	.card:focus-within {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.sname {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.sdesc,
	.facts {
		font-size: 0.6875rem;
		line-height: 1.4;
		color: var(--text-muted);
	}
	span.facts {
		color: var(--text-secondary);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 13.75rem;
		gap: 1rem;
	}
	.seg {
		display: flex;
		gap: 2px;
		height: 2.5rem;
		box-sizing: border-box;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.05);
	}
	.segbtn {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: capitalize;
		white-space: nowrap;
		cursor: pointer;
	}
	.segbtn.on {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.segbtn.off {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.segbtn:focus-within,
	.segbtn:focus-visible {
		outline: 2px solid var(--text-primary);
	}
	.seed {
		display: flex;
		gap: 6px;
	}
	.seed input {
		flex: 1;
		min-width: 0;
	}
	.dice {
		flex: none;
		width: 2.5rem;
		height: 2.5rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 10px;
		background: rgb(255 255 255 / 0.08);
		color: var(--text-primary);
		cursor: pointer;
	}
	.grav {
		flex-direction: row;
		align-items: center;
		gap: 0.875rem;
	}
	.grav svg {
		flex: none;
		width: 5.25rem;
		height: 5.25rem;
		fill: none;
		stroke-linecap: round;
	}
	.g-body {
		fill: rgb(127 178 255 / 0.3);
		stroke: #7fb2ff;
		stroke-width: 1.6;
	}
	.g-moon {
		fill: rgb(155 160 168 / 0.3);
		stroke: #9ba0a8;
		stroke-width: 1.4;
	}
	.g-soi {
		stroke: rgb(255 255 255 / 0.3);
		stroke-width: 1;
		stroke-dasharray: 3 4;
		fill: none;
	}
	.g-orbit {
		stroke: var(--accent);
		stroke-width: 1.6;
		fill: none;
	}
	.gtext {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.site {
		gap: 0.75rem;
	}
	.globe {
		position: relative;
		height: 23.75rem;
		display: grid;
		place-items: center;
		border-radius: 20px;
		background: radial-gradient(
			circle at 50% 50%,
			rgb(62 106 225 / 0.12),
			rgb(255 255 255 / 0.02) 60%
		);
		border: 1px solid rgb(255 255 255 / 0.06);
		overflow: hidden;
	}
	.globe svg {
		width: min(22.5rem, 100%);
		height: auto;
		aspect-ratio: 1;
	}
	.sea {
		fill: #0d1b33;
		stroke: rgb(150 190 255 / 0.35);
		stroke-width: 1.5;
	}
	.grid {
		fill: none;
		stroke: rgb(255 255 255 / 0.09);
		stroke-width: 1;
	}
	.halo {
		fill: color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.pin {
		fill: #fff;
		stroke: var(--accent);
		stroke-width: 3;
	}
	.tag {
		position: absolute;
		height: 1.25rem;
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(22 23 26 / 0.85);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 700;
		white-space: nowrap;
		pointer-events: none;
	}
	.sites {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 6px;
	}
	.srow {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.875rem;
		border-radius: 12px;
		border: 1px solid transparent;
		background: rgb(255 255 255 / 0.03);
		cursor: pointer;
	}
	.srow.on {
		border-color: rgb(255 255 255 / 0.24);
		background: rgb(255 255 255 / 0.08);
	}
	.srow:focus-within {
		outline: 2px solid var(--text-primary);
	}
	.srow .sname {
		font-size: 0.8125rem;
	}
	.coords {
		font-size: 0.6875rem;
		color: var(--text-subtle);
		white-space: nowrap;
	}
	.consequences {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 1rem;
		margin: 0;
		font-size: 0.75rem;
	}
	.consequences dt {
		color: var(--text-muted);
	}
	.consequences dd {
		margin: 0;
		color: var(--text-primary);
	}
	/* step 3 · rules */
	.rules {
		display: grid;
		grid-template-columns: 17.5rem minmax(0, 1fr);
		gap: 2rem;
	}
	.cats [role='tablist'] {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.cat {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 3.75rem;
		padding: 0 0.875rem 0 0.625rem;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.cat[aria-selected='true'] {
		background: rgb(255 255 255 / 0.08);
	}
	.cat .dot {
		top: 50%;
		right: 0.875rem;
		width: 5px;
		height: 5px;
		margin-top: -2.5px;
	}
	.cico {
		flex: none;
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: rgb(255 255 255 / 0.06);
		color: var(--text-secondary);
	}
	.ctext {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.cname {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.csub {
		font-size: 0.6875rem;
		color: var(--text-subtle);
	}
	.hint.box {
		margin: 1rem 0 0;
		padding: 0.875rem;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.03);
	}
	.rows {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.rhead {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		padding-bottom: 0.875rem;
	}
	.rhead h2 {
		margin: 0;
		font-size: 2rem;
		font-weight: 300;
		color: var(--text-primary);
	}
	.changed {
		margin-left: auto;
		font-size: 0.6875rem;
		color: var(--text-subtle);
	}
	.rhead .soft {
		margin-left: 0;
	}
	.rule {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		min-height: 4rem;
		padding: 0.625rem 4px;
		box-sizing: border-box;
		border-top: 1px solid rgb(255 255 255 / 0.06);
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.rname {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.cdot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.fixed {
		height: 1.125rem;
		padding: 0 0.4375rem;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.08);
		color: var(--text-secondary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.rdesc {
		max-width: 47.5rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-subtle);
	}
	.rule > :last-child {
		margin-left: auto;
		flex: none;
	}
	.rule .seg {
		height: 2.125rem;
	}
	.rule .segbtn {
		flex: none;
	}
	.numin {
		width: 7.5rem;
		text-align: right;
	}
	.switch {
		width: 2.75rem;
		height: 1.625rem;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		border: 0;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.14);
		cursor: pointer;
	}
	.switch[aria-checked='true'] {
		justify-content: flex-end;
		background: var(--accent);
	}
	.knob {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 50%;
		background: #fff;
	}
	.switch:focus-visible,
	.cat:focus-visible,
	.mcard:focus-visible,
	.step:focus-visible,
	.round:focus-visible,
	.soft:focus-visible,
	.dice:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	/* the step buttons at the foot */
	.nav {
		grid-column: 1;
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.nav .hint {
		margin-right: auto;
	}
	.ghost,
	.next {
		height: 3rem;
		padding: 0 1.5rem;
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}
	.ghost {
		border: 1px solid rgb(255 255 255 / 0.12);
		background: transparent;
		color: var(--text-primary);
	}
	.next {
		border: 0;
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	/* the summary */
	.summary {
		grid-column: 2;
		grid-row: 2 / 4;
		align-self: start;
		position: sticky;
		top: 2rem;
		display: flex;
		flex-direction: column;
		min-height: min(57rem, calc(100dvh - 8rem));
		border-radius: 24px;
		overflow: hidden;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	.shead {
		position: relative;
		height: 13.75rem;
		flex: none;
		overflow: hidden;
		background: #05070c;
	}
	.planet {
		position: absolute;
		left: 7.5rem;
		top: 1.5rem;
		width: 26.25rem;
		height: 26.25rem;
		border-radius: 50%;
		background: radial-gradient(
			circle at 30% 28%,
			var(--mode),
			color-mix(in srgb, var(--mode) 55%, transparent) 26%,
			#10182c 58%,
			#05070c 80%
		);
		box-shadow: 0 0 80px 10px color-mix(in srgb, var(--mode) 25%, transparent);
		transition: background 400ms ease;
	}
	.shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(0deg, rgb(14 15 18 / 0.95) 0%, rgb(14 15 18 / 0) 60%);
	}
	.chips {
		position: absolute;
		left: 1.375rem;
		bottom: 3.875rem;
		display: flex;
		gap: 5px;
	}
	.chip {
		height: 1.25rem;
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.14);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.sumname {
		position: absolute;
		left: 1.375rem;
		right: 1.375rem;
		bottom: 1.125rem;
		font-size: 1.875rem;
		line-height: 1.05;
		font-weight: 300;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sbody {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
		padding: 1.25rem 1.375rem 1.375rem;
	}
	dl.facts {
		margin: 0;
	}
	dl.facts div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 2rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.05);
		font-size: 0.75rem;
	}
	dl.facts dt {
		color: var(--text-muted);
	}
	dl.facts dd {
		margin: 0;
		color: var(--text-primary);
		font-weight: 600;
	}
	.keys {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.krow {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.krule {
		height: 1.375rem;
		padding: 0 0.5625rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.1);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 600;
	}
	.krule.off {
		background: transparent;
		color: #5b5d63;
		text-decoration: line-through;
	}
	.lock {
		display: flex;
		gap: 0.625rem;
		margin: 0;
		padding: 0.75rem;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.04);
		font-size: 0.6875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.lock svg {
		flex: none;
		margin-top: 1px;
		color: var(--text-secondary);
	}
	.lock b {
		color: var(--text-primary);
		font-weight: 600;
	}
	.problem {
		margin: 0;
		color: var(--danger);
		font-size: 0.75rem;
	}
	.go {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.create-btn {
		height: 3.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		border: 0;
		border-radius: 14px;
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 700;
		cursor: pointer;
	}
	.create-btn:disabled {
		opacity: 0.5;
	}
	.cancel {
		height: 2.5rem;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		opacity: 0;
	}
	/* narrow windows: one column, the summary under the steps */
	@media (max-width: 1100px) {
		.create {
			grid-template-columns: minmax(0, 1fr);
			padding: 1.5rem;
		}
		.summary {
			grid-column: 1;
			grid-row: auto;
			position: static;
			min-height: 0;
		}
		.world,
		.rules {
			grid-template-columns: minmax(0, 1fr);
		}
		.steps {
			position: static;
			transform: none;
			margin-left: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glow,
		.planet,
		.mcard {
			transition: none;
		}
	}
</style>
