/**
 * Guest-side prelude: runs inside QuickJS before the user script. It is an expression evaluating
 * to `function (host, seed)` returning `{ update, start }`. The `host` object (functions built by
 * the runner) is captured in this closure and never stored on the global, so a script cannot
 * reach it; every value crossing it is a string the host parses and validates.
 *
 * The source must not contain backticks or `${`: it lives in a template literal.
 */
export const PRELUDE = String.raw`(function (host, seed, bodiesJson) {
	'use strict';
	let T = null;
	let refusals = [];
	// seq -> { kind, resolve }: commands waiting for the host's verdict (plan 032).
	const sent = new Map();
	let s = seed >>> 0;
	let waiters = [];
	let tickWaiters = [];
	let throttle = 0;
	let attitude = { pitch: 0, yaw: 0, roll: 0 };
	// A mode set this tick reads back at once; the next snapshot carries the sim's own value.
	let sasPending = null;
	const SAS_MODES = ['off', 'hold', 'prograde', 'retrograde', 'normal', 'antinormal', 'radial-out', 'radial-in', 'maneuver', 'target', 'anti-target'];
	let defined = false;

	// Seeded PRNG (mulberry32): a script's Math.random must not depend on the host.
	Math.random = function random() {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	// Date reads the simulation clock, not the wall clock: a replay of a script is the same run.
	// The native Date stays in this closure; the prototype's constructor points at the replacement.
	const NativeDate = Date;
	const simNow = () => (T === null ? 0 : Math.floor(T.t * 1000));
	function SimDate(...args) {
		if (!new.target) return new NativeDate(simNow()).toString();
		return Reflect.construct(NativeDate, args.length === 0 ? [simNow()] : args, new.target === SimDate ? NativeDate : new.target);
	}
	SimDate.prototype = NativeDate.prototype;
	Object.defineProperty(NativeDate.prototype, 'constructor', { value: SimDate, writable: true, configurable: true });
	SimDate.now = simNow;
	SimDate.parse = NativeDate.parse;
	SimDate.UTC = NativeDate.UTC;
	Object.defineProperty(globalThis, 'Date', { value: SimDate, writable: false, configurable: false });

	const fixed = (name, value) =>
		Object.defineProperty(globalThis, name, { value, writable: false, configurable: false, enumerable: true });
	const needTelemetry = () => {
		if (T === null) throw new Error('no telemetry yet');
		return T;
	};
	const text = (a) => {
		if (typeof a === 'string') return a;
		try {
			const j = JSON.stringify(a);
			return j === undefined ? String(a) : j;
		} catch (e) {
			return String(a);
		}
	};

	const freeze = (o) => {
		for (const key of Object.keys(o)) if (typeof o[key] === 'object' && o[key] !== null) freeze(o[key]);
		return Object.freeze(o);
	};
	const bodies = JSON.parse(bodiesJson);
	// bodies[id].state(t, frame): position and velocity at simulation time t from the body's orbit
	// (plan 035). The host computes it; frame is 'parent' (default) or 'system'. Not enumerable, so
	// printing a body still shows its data only.
	for (const id of Object.keys(bodies)) {
		Object.defineProperty(bodies[id], 'state', {
			value: (t, frame) => JSON.parse(host.bodyState(id, t, frame === undefined ? 'parent' : frame)),
			enumerable: false
		});
	}
	freeze(bodies);

	// Commands whose outcome the script can await. A command that was not sent (a repeated
	// setpoint) is fine by definition.
	const request = (kind, payload) => {
		const seq = host.cmd(kind, payload);
		if (seq < 0) return Promise.resolve({ ok: true });
		return new Promise((resolve) => {
			sent.set(seq, { kind, resolve });
			if (sent.size > 512) sent.delete(sent.keys().next().value);
		});
	};

	// Setters have no result to await; a refusal shows up in ship.refusals on a later tick.
	const track = (kind, seq) => {
		if (seq < 0) return;
		sent.set(seq, { kind, resolve: null });
		if (sent.size > 512) sent.delete(sent.keys().next().value);
	};

	const ship = {};
	Object.defineProperty(ship, 'throttle', {
		enumerable: true,
		get: () => throttle,
		set: (value) => {
			if (typeof value !== 'number') throw new TypeError('ship.throttle must be a number');
			track('throttle', host.cmd('throttle', JSON.stringify({ value })));
			throttle = value;
		}
	});
	Object.defineProperty(ship, 'attitude', {
		enumerable: true,
		get: () => ({ pitch: attitude.pitch, yaw: attitude.yaw, roll: attitude.roll }),
		set: (v) => {
			if (typeof v !== 'object' || v === null) throw new TypeError('ship.attitude must be { pitch, yaw, roll }');
			const next = { pitch: v.pitch === undefined ? 0 : v.pitch, yaw: v.yaw === undefined ? 0 : v.yaw, roll: v.roll === undefined ? 0 : v.roll };
			track('attitude', host.cmd('attitude', JSON.stringify(next)));
			attitude = next;
		}
	});

	Object.defineProperty(ship, 'sas', {
		enumerable: true,
		get: () => (sasPending !== null ? sasPending : needTelemetry().sas),
		set: (mode) => {
			if (typeof mode !== 'string' || !SAS_MODES.includes(mode)) {
				throw new TypeError('ship.sas must be one of ' + SAS_MODES.join(', '));
			}
			track('sas', host.cmd('sas', JSON.stringify({ mode })));
			sasPending = mode;
		}
	});

	const wait = (seconds) => {
		if (typeof seconds !== 'number' || !(seconds >= 0) || !isFinite(seconds)) {
			throw new RangeError('wait(seconds) needs a finite number >= 0');
		}
		const at = needTelemetry().t + seconds;
		return new Promise((resolve) => waiters.push({ at, resolve }));
	};
	const nextTick = () => new Promise((resolve) => tickWaiters.push(resolve));
	const waitUntil = async (predicate) => {
		while (!predicate()) await nextTick();
	};

	fixed('ship', ship);
	fixed('wait', wait);
	fixed('nextTick', nextTick);
	fixed('waitUntil', waitUntil);
	fixed('time', () => needTelemetry().t);
	// date(t = now): { text, julianDate } in the world's calendar, from the host (plan 081).
	fixed('date', (t) => JSON.parse(host.date(t === undefined ? needTelemetry().t : t)));
	fixed('stage', () => request('stage', '{}'));
	fixed('action', (part, module, action, ...args) =>
		request('action', JSON.stringify({ part, module, action, args }))
	);
	fixed('warp', (factor) => request('warp', JSON.stringify({ factor })));
	// Maneuver nodes (plan 045). The new node shows up in ship.nodes on a later tick.
	const nodeFields = (spec) => {
		if (typeof spec !== 'object' || spec === null) throw new TypeError('a node needs { time, prograde, normal, radial }');
		return {
			time: spec.time,
			prograde: spec.prograde === undefined ? 0 : spec.prograde,
			normal: spec.normal === undefined ? 0 : spec.normal,
			radial: spec.radial === undefined ? 0 : spec.radial
		};
	};
	fixed('addNode', (spec) => request('node-set', JSON.stringify(nodeFields(spec))));
	fixed('setNode', (id, spec) => {
		const old = needTelemetry().nodes.find((n) => n.id === id);
		const merged = Object.assign({}, old === undefined ? {} : { time: old.time, prograde: old.prograde, normal: old.normal, radial: old.radial }, spec);
		return request('node-set', JSON.stringify(Object.assign(nodeFields(merged), { id })));
	});
	fixed('removeNode', (id) => request('node-remove', JSON.stringify(id === undefined ? {} : { id })));
	fixed('warpTo', (time, factor) => request('warp-to', JSON.stringify({ time, factor: factor === undefined ? 100000 : factor })));
	// Targets (plan 035, ADR 0064): a body id, a vessel id, an entry of ship.targets, or null to clear.
	const targetRef = (spec) => {
		if (spec === null) return null;
		if (typeof spec === 'string') return { kind: 'body', id: spec };
		if (typeof spec === 'number') return { kind: 'vessel', id: spec };
		if (typeof spec === 'object' && (spec.kind === 'body' || spec.kind === 'vessel')) {
			return { kind: spec.kind, id: spec.id };
		}
		throw new TypeError('setTarget needs a body id, a vessel id, an entry of ship.targets, or null');
	};
	fixed('setTarget', (spec) => request('target-set', JSON.stringify({ target: targetRef(spec) })));
	fixed('bodies', bodies);
	fixed('print', (...args) => host.print(args.map(text).join(' ')));

	return {
		update(json, verdictsJson) {
			T = JSON.parse(json);
			sasPending = null;
			refusals = [];
			for (const v of JSON.parse(verdictsJson)) {
				const entry = sent.get(v.seq);
				if (entry === undefined) continue;
				sent.delete(v.seq);
				if (!v.ok) refusals.push({ command: entry.kind, reason: String(v.reason || 'refused') });
				if (entry.resolve) entry.resolve(v.ok ? { ok: true } : { ok: false, reason: String(v.reason || 'refused') });
			}
			Object.freeze(refusals);
			if (!defined) {
				defined = true;
				Object.defineProperty(ship, 'refusals', { enumerable: true, get: () => refusals });
				for (const key of Object.keys(T)) {
					if (key === 'sas') continue;
					Object.defineProperty(ship, key, { enumerable: true, get: () => T[key] });
				}
				Object.freeze(ship);
			}
			const ticks = tickWaiters;
			tickWaiters = [];
			for (const resolve of ticks) resolve();
			const due = [];
			const later = [];
			for (const w of waiters) (w.at <= T.t + 1e-9 ? due : later).push(w);
			waiters = later;
			due.sort((a, b) => a.at - b.at);
			for (const w of due) w.resolve();
		},
		start(fn) {
			fn().then(
				() => host.done(true, '', '', ''),
				(e) =>
					host.done(
						false,
						e && e.name ? String(e.name) : 'Error',
						e && e.message !== undefined ? String(e.message) : String(e),
						e && e.stack ? String(e.stack) : ''
					)
			);
		}
	};
})`;
