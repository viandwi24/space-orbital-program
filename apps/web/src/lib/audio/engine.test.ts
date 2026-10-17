import { describe, expect, it } from 'vitest';
import { createAudioEngine, noiseSamples, type AudioEnv, type AudioState } from './engine';
import { createDirector } from './director';
import { SILENCE, flightSound } from './params';

/** A recording stand-in for the parts of the Web Audio API the engine uses. */
class FakeParam {
	value = 0;
	target: number | null = null;
	setTargetAtTime(v: number): void {
		this.target = v;
	}
	setValueAtTime(v: number): void {
		this.value = v;
	}
	linearRampToValueAtTime(): void {}
	exponentialRampToValueAtTime(): void {}
}
class FakeNode {
	connected: FakeNode[] = [];
	disconnected = false;
	gain = new FakeParam();
	frequency = new FakeParam();
	Q = new FakeParam();
	type = '';
	loop = false;
	buffer: unknown = null;
	fftSize = 0;
	onended: (() => void) | null = null;
	started = false;
	constructor(
		readonly kind: string,
		private readonly ctx: FakeContext
	) {}
	connect(to: FakeNode): FakeNode {
		this.connected.push(to);
		return to;
	}
	disconnect(): void {
		this.disconnected = true;
	}
	start(): void {
		this.started = true;
		// A one-shot oscillator ends by itself; the engine disconnects it then.
		if (this.kind === 'osc' && this.ctx.autoEnd) queueMicrotask(() => this.onended?.());
	}
	stop(): void {}
	getFloatTimeDomainData(out: Float32Array): void {
		out.fill(this.ctx.analyserValue);
	}
}
class FakeContext {
	static created = 0;
	state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
	onstatechange: (() => void) | null = null;
	currentTime = 0;
	sampleRate = 8000;
	destination = new FakeNode('destination', this);
	nodes: FakeNode[] = [];
	autoEnd = true;
	analyserValue = 0;
	resumes = 0;
	suspends = 0;
	constructor() {
		FakeContext.created++;
	}
	private make(kind: string): FakeNode {
		const n = new FakeNode(kind, this);
		this.nodes.push(n);
		return n;
	}
	createGain = () => this.make('gain');
	createDynamicsCompressor = () => this.make('compressor');
	createBiquadFilter = () => this.make('filter');
	createOscillator = () => this.make('osc');
	createBufferSource = () => this.make('source');
	createAnalyser = () => this.make('analyser');
	createBuffer(_c: number, length: number) {
		return { length, copyToChannel: () => undefined };
	}
	resume(): Promise<void> {
		this.resumes++;
		this.state = 'running';
		return Promise.resolve();
	}
	suspend(): Promise<void> {
		this.suspends++;
		this.state = 'suspended';
		return Promise.resolve();
	}
	close(): Promise<void> {
		this.state = 'closed';
		return Promise.resolve();
	}
	count(kind: string): FakeNode[] {
		return this.nodes.filter((n) => n.kind === kind);
	}
}

function rig(options: { noAudio?: boolean } = {}) {
	let gesture: () => void = () => {};
	let visibility: (v: boolean) => void = () => {};
	let visible = true;
	const states: AudioState[] = [];
	let ctx: FakeContext | null = null;
	FakeContext.created = 0;
	const env: AudioEnv = {
		createContext: () => {
			if (options.noAudio) return null;
			ctx = new FakeContext();
			return ctx as unknown as AudioContext;
		},
		onGesture: (fn) => {
			gesture = fn;
			return () => {};
		},
		onVisibility: (fn) => {
			visibility = fn;
			return () => {};
		},
		visible: () => visible,
		publish: (s) => states.push(s)
	};
	const engine = createAudioEngine(env);
	return {
		engine,
		states,
		get ctx() {
			return ctx!;
		},
		gesture: () => gesture(),
		hide: () => {
			visible = false;
			visibility(false);
		},
		show: () => {
			visible = true;
			visibility(true);
		}
	};
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const master = (r: ReturnType<typeof rig>) => r.ctx.count('gain')[0]!;

describe('the gesture gate', () => {
	it('creates nothing before the first gesture and reports locked', () => {
		const r = rig();
		expect(FakeContext.created).toBe(0);
		expect(r.engine.state).toBe('locked');
		// every call is a no-op while locked
		r.engine.setFlight(
			flightSound({ throttle: 1, engineOn: true, pressure: 1, speed: 0, warp: 1, paused: false })
		);
		r.engine.oneShot('stage');
		r.engine.setVolumes({ master: 0.5, effects: 0.5, ui: 0.5, muted: false });
		expect(FakeContext.created).toBe(0);
		expect(r.engine.level()).toBe(0);
		expect(r.states.at(-1)).toBe('locked');
	});
	it('the first gesture creates one context and resumes it; later gestures reuse it', async () => {
		const r = rig();
		r.gesture();
		await tick();
		expect(FakeContext.created).toBe(1);
		expect(r.ctx.resumes).toBe(1);
		expect(r.engine.state).toBe('running');
		expect(r.states.at(-1)).toBe('running');
		r.gesture();
		r.gesture();
		expect(FakeContext.created).toBe(1);
		expect(r.ctx.resumes).toBe(1);
	});
	it('stays locked without throwing when the browser has no Web Audio', () => {
		const r = rig({ noAudio: true });
		expect(() => r.gesture()).not.toThrow();
		r.engine.oneShot('click');
		r.engine.setFlight(SILENCE);
		expect(r.engine.state).toBe('locked');
	});
	it('stays locked when creating the context throws', () => {
		const env: AudioEnv = {
			createContext: () => {
				throw new Error('blocked');
			},
			onGesture: (fn) => {
				fn();
				return () => {};
			},
			onVisibility: () => () => {},
			visible: () => true,
			publish: () => {}
		};
		expect(createAudioEngine(env).state).toBe('locked');
	});
});

describe('an interruption (a call, Siri, the lock screen on mobile Safari)', () => {
	it('shows as suspended in the page state and the next gesture resumes it', async () => {
		const r = rig();
		r.gesture();
		await tick();
		expect(r.engine.state).toBe('running');
		// the system takes the audio: the context reports it through statechange
		r.ctx.state = 'interrupted';
		r.ctx.onstatechange?.();
		expect(r.engine.state).toBe('suspended');
		expect(r.states.at(-1)).toBe('suspended');
		expect(r.ctx.resumes).toBe(1);
		r.gesture();
		await tick();
		expect(r.ctx.resumes).toBe(2);
		expect(r.engine.state).toBe('running');
	});
	it('does not try to resume a closed context, and waits while the page is hidden', async () => {
		const r = rig();
		r.gesture();
		await tick();
		r.hide();
		await tick();
		r.ctx.state = 'interrupted';
		r.gesture();
		expect(r.ctx.resumes).toBe(1);
		r.show();
		await tick();
		expect(r.ctx.resumes).toBe(2);
		r.ctx.state = 'closed';
		r.gesture();
		expect(r.ctx.resumes).toBe(2);
	});
});

describe('visibility', () => {
	it('suspends on a hidden tab and resumes when it is shown again, only once unlocked', async () => {
		const r = rig();
		r.hide();
		r.show();
		expect(FakeContext.created).toBe(0);
		r.gesture();
		await tick();
		r.hide();
		await tick();
		expect(r.ctx.suspends).toBe(1);
		expect(r.engine.state).toBe('suspended');
		r.show();
		await tick();
		expect(r.engine.state).toBe('running');
	});
	it('a gesture while the tab is hidden does not resume', async () => {
		const r = rig();
		r.hide();
		r.gesture();
		await tick();
		expect(r.ctx.resumes).toBe(0);
		expect(r.engine.state).toBe('suspended');
	});
});

describe('volumes and mute', () => {
	it('scale the buses and ramp the master to 0 when muted', async () => {
		const r = rig();
		r.gesture();
		await tick();
		r.engine.setVolumes({ master: 0.5, effects: 0.25, ui: 0.1, muted: false });
		const gains = r.ctx.count('gain');
		// creation order: master, effects, ui
		expect(gains[0]!.gain.target).toBe(0.5);
		expect(gains[1]!.gain.target).toBe(0.25);
		expect(gains[2]!.gain.target).toBe(0.1);
		r.engine.setVolumes({ master: 0.5, effects: 0.25, ui: 0.1, muted: true });
		expect(master(r).gain.target).toBe(0);
		expect(r.engine.state).toBe('muted');
		expect(r.states.at(-1)).toBe('muted');
		r.engine.setVolumes({ master: 0.5, effects: 0.25, ui: 0.1, muted: false });
		expect(master(r).gain.target).toBe(0.5);
		expect(r.engine.state).toBe('running');
	});
	it('volumes set before the unlock apply when the graph is built', async () => {
		const r = rig();
		r.engine.setVolumes({ master: 0.3, effects: 0.9, ui: 0.2, muted: false });
		r.gesture();
		await tick();
		expect(master(r).gain.target).toBe(0.3);
	});
});

describe('flight sound targets', () => {
	it('reach the graph: roar gain and cutoff, rumble, wind', async () => {
		const r = rig();
		r.gesture();
		await tick();
		const s = flightSound({
			throttle: 1,
			engineOn: true,
			pressure: 1,
			speed: 200,
			warp: 1,
			paused: false
		});
		r.engine.setFlight(s);
		const targets = r.ctx.nodes
			.flatMap((n) => [n.gain.target, n.frequency.target])
			.filter((v) => v !== null);
		for (const expected of [
			s.roarGain,
			s.roarCutoff,
			s.rumbleGain,
			s.rumbleFreq,
			s.windGain,
			s.windCutoff
		])
			expect(targets).toContain(expected);
	});
	it('are held and applied once the context exists', async () => {
		const r = rig();
		const s = flightSound({
			throttle: 1,
			engineOn: true,
			pressure: 1,
			speed: 0,
			warp: 1,
			paused: false
		});
		r.engine.setFlight(s);
		r.gesture();
		await tick();
		const targets = r.ctx.nodes.map((n) => n.gain.target);
		expect(targets).toContain(s.roarGain);
	});
});

describe('one-shots', () => {
	it('play only while running and unmuted, and disconnect themselves at their end', async () => {
		const r = rig();
		r.engine.oneShot('click');
		r.gesture();
		await tick();
		r.engine.oneShot('stage');
		r.engine.oneShot('warning');
		r.engine.oneShot('sasOn');
		expect(r.engine.activeShots).toBe(4);
		await tick();
		expect(r.engine.activeShots).toBe(0);
		const osc = r.ctx.count('osc').filter((n) => n.started);
		expect(osc.length).toBeGreaterThanOrEqual(5);
		// the oscillators of one-shots (all but the engine's own rumble tone) are disconnected
		expect(osc.slice(1).every((n) => n.disconnected)).toBe(true);
		r.engine.setVolumes({ master: 1, effects: 1, ui: 1, muted: true });
		r.engine.oneShot('click');
		expect(r.engine.activeShots).toBe(0);
	});
	it('are dropped while the context is suspended', async () => {
		const r = rig();
		r.gesture();
		await tick();
		r.hide();
		await tick();
		r.engine.oneShot('stage');
		expect(r.engine.activeShots).toBe(0);
	});
});

describe('level', () => {
	it('reads the analyser: 0 when silent, the RMS otherwise', async () => {
		const r = rig();
		r.gesture();
		await tick();
		expect(r.engine.level()).toBe(0);
		r.ctx.analyserValue = 0.25;
		expect(r.engine.level()).toBeCloseTo(0.25, 6);
	});
});

describe('the noise buffer', () => {
	it('is deterministic, bounded, and loops without a step', () => {
		const a = noiseSamples(4096);
		const b = noiseSamples(4096);
		expect(Array.from(a.slice(0, 16))).toEqual(Array.from(b.slice(0, 16)));
		expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(0.9 + 1e-6);
		expect(Math.abs(a[4095]! - a[0]!)).toBeLessThan(0.01);
		expect(a.some((x) => x !== 0)).toBe(true);
	});
});

describe('director', () => {
	const view = {
		throttle: 1,
		engineOn: true,
		altitude: 0,
		speed: 0,
		heat: 0,
		atmosphere: { scaleHeight: 7_500, surfacePressure: 101_325, height: 70_000 }
	};
	it('updates the engine every 50 ms at most and maps the HUD view', async () => {
		const r = rig();
		r.gesture();
		await tick();
		const d = createDirector(r.engine);
		d.frame(0, view, 1, false);
		const before = r.ctx.nodes.map((n) => n.gain.target);
		expect(before).toContain(1);
		// a frame 10 ms later is skipped: nothing changes even if the view does
		d.frame(10, { ...view, throttle: 0 }, 1, false);
		expect(r.ctx.nodes.map((n) => n.gain.target)).toEqual(before);
		d.frame(60, { ...view, throttle: 0 }, 1, false);
		expect(r.ctx.nodes.map((n) => n.gain.target)).not.toEqual(before);
	});
	it('is silent in vacuum except the rumble, and for warp and pause', async () => {
		const r = rig();
		r.gesture();
		await tick();
		const d = createDirector(r.engine);
		d.frame(0, { ...view, altitude: 200_000 }, 1, false);
		const vacuum = flightSound({
			throttle: 1,
			engineOn: true,
			pressure: 0,
			speed: 0,
			warp: 1,
			paused: false
		});
		const t = r.ctx.nodes.map((n) => n.gain.target);
		expect(t).toContain(vacuum.rumbleGain);
		expect(t).not.toContain(1);
		d.frame(100, view, 100, false);
		expect(
			r.ctx.nodes.map((n) => n.gain.target).filter((v) => v !== null && v > 0.1 && v < 2)
		).not.toContain(1);
	});
	it('beeps when a part is hot, at most every 1.5 s, not while paused', async () => {
		const r = rig();
		r.gesture();
		await tick();
		const d = createDirector(r.engine);
		const hot = { ...view, heat: 0.95 };
		d.frame(0, hot, 1, false);
		expect(r.engine.activeShots).toBe(2);
		d.frame(100, hot, 1, false);
		d.frame(200, hot, 1, false);
		expect(r.engine.activeShots).toBe(2);
		d.frame(5_000, hot, 1, true);
		expect(r.engine.activeShots).toBe(2);
	});
	it('costs well under a millisecond per frame on average', async () => {
		const r = rig();
		r.gesture();
		await tick();
		const d = createDirector(r.engine);
		for (let i = 0; i < 2000; i++)
			d.frame(i * 16.7, { ...view, throttle: (i % 100) / 100, speed: i % 400 }, 1, false);
		expect(d.cost.calls).toBe(2000);
		expect(d.cost.ms / d.cost.calls).toBeLessThan(1);
	});
});
