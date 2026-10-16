/**
 * Guest-side prelude: runs inside QuickJS before the user script. It is an expression evaluating
 * to `function (host, seed)` returning `{ update, start }`. The `host` object (functions built by
 * the runner) is captured in this closure and never stored on the global, so a script cannot
 * reach it; every value crossing it is a string the host parses and validates.
 *
 * The source must not contain backticks or `${`: it lives in a template literal.
 */
export const PRELUDE = String.raw`(function (host, seed) {
	'use strict';
	let T = null;
	let s = seed >>> 0;
	let waiters = [];
	let tickWaiters = [];
	let throttle = 0;
	let attitude = { pitch: 0, yaw: 0, roll: 0 };
	let defined = false;

	// Seeded PRNG (mulberry32): a script's Math.random must not depend on the host.
	Math.random = function random() {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

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

	const ship = {};
	Object.defineProperty(ship, 'throttle', {
		enumerable: true,
		get: () => throttle,
		set: (value) => {
			if (typeof value !== 'number') throw new TypeError('ship.throttle must be a number');
			host.cmd('throttle', JSON.stringify({ value }));
			throttle = value;
		}
	});
	Object.defineProperty(ship, 'attitude', {
		enumerable: true,
		get: () => ({ pitch: attitude.pitch, yaw: attitude.yaw, roll: attitude.roll }),
		set: (v) => {
			if (typeof v !== 'object' || v === null) throw new TypeError('ship.attitude must be { pitch, yaw, roll }');
			const next = { pitch: v.pitch === undefined ? 0 : v.pitch, yaw: v.yaw === undefined ? 0 : v.yaw, roll: v.roll === undefined ? 0 : v.roll };
			host.cmd('attitude', JSON.stringify(next));
			attitude = next;
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
	fixed('stage', () => host.cmd('stage', '{}'));
	fixed('action', (part, module, action, ...args) =>
		host.cmd('action', JSON.stringify({ part, module, action, args }))
	);
	fixed('print', (...args) => host.print(args.map(text).join(' ')));

	return {
		update(json) {
			T = JSON.parse(json);
			if (!defined) {
				defined = true;
				for (const key of Object.keys(T)) {
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
