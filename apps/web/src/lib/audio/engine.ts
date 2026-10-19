/**
 * The Web Audio graph (plan 053, ADR 0062): looped noise and oscillators through filters and gains,
 * a compressor on the master. No audio files and no AudioWorklet. Nothing exists until the first
 * user gesture (autoplay policy, `research/web-audio-and-touch.md`); a hidden tab suspends the
 * context. The main thread only sets parameters; the sound is made on the audio thread.
 */
import { busGains, type FlightSound, type Volumes } from './params';

export type OneShot = 'click' | 'sasOn' | 'sasOff' | 'stage' | 'warning' | 'chute';
/** `locked`: no gesture yet (or no Web Audio); `muted`: the player's mute; otherwise the context's state. */
export type AudioState = 'locked' | 'running' | 'suspended' | 'muted';

/** What the engine needs from the page, so tests can fake it. */
export interface AudioEnv {
	createContext(): AudioContext | null;
	/** Call `fn` on every user gesture that may unlock audio; returns the unsubscribe. */
	onGesture(fn: () => void): () => void;
	onVisibility(fn: (visible: boolean) => void): () => void;
	visible(): boolean;
	/** Mirror of the state for the page (`data-audio`), so a test can read it without a hook. */
	publish(state: AudioState): void;
}

export interface AudioEngine {
	readonly state: AudioState;
	setVolumes(v: Volumes): void;
	/** Target values for the continuous sounds (engine, rumble, wind). */
	setFlight(sound: FlightSound): void;
	oneShot(kind: OneShot): void;
	/** RMS of the master output right now, 0..1 (creates an analyser on first use; for tests and the debug hook). */
	level(): number;
	/** One-shot graphs still alive (a leak check for tests). */
	readonly activeShots: number;
	dispose(): void;
}

const DEFAULT_VOLUMES: Volumes = { master: 0.7, effects: 0.8, ui: 0.6, muted: false };
/** Parameter smoothing time constant, s: fast enough to follow the throttle, too slow to click. */
const SMOOTH = 0.08;
const NOISE_SECONDS = 2;

/** Brown-ish noise from a seeded generator (the same every run) that loops without a step. */
export function noiseSamples(length: number, seed = 0x9e3779b9): Float32Array {
	const out = new Float32Array(length);
	let state = seed >>> 0;
	let last = 0;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		const white = state / 0x80000000 - 1;
		last = (last + 0.02 * white) / 1.02;
		out[i] = last;
	}
	// A random walk does not return to its start: take out the linear drift so the loop has no step.
	const drift = out[length - 1]! - out[0]!;
	let peak = 1e-6;
	for (let i = 0; i < length; i++) {
		out[i] = out[i]! - (drift * i) / (length - 1);
		peak = Math.max(peak, Math.abs(out[i]!));
	}
	for (let i = 0; i < length; i++) out[i] = (out[i]! / peak) * 0.9;
	return out;
}

export function createAudioEngine(env: AudioEnv): AudioEngine {
	let ctx: AudioContext | null = null;
	let volumes: Volumes = { ...DEFAULT_VOLUMES };
	let flight: FlightSound | null = null;
	let disposed = false;
	let shots = 0;
	let analyser: AnalyserNode | null = null;
	let samples: Float32Array<ArrayBuffer> | null = null;
	type Graph = {
		master: GainNode;
		effects: GainNode;
		ui: GainNode;
		roarGain: GainNode;
		roarFilter: BiquadFilterNode;
		rumbleGain: GainNode;
		rumbleOsc: OscillatorNode;
		windGain: GainNode;
		windFilter: BiquadFilterNode;
		hissGain: GainNode;
		noise: AudioBuffer;
	};
	let g: Graph | null = null;

	const stateNow = (): AudioState => {
		if (ctx === null) return 'locked';
		if (volumes.muted) return 'muted';
		return ctx.state === 'running' ? 'running' : 'suspended';
	};
	const publish = (): void => env.publish(stateNow());

	const ramp = (param: AudioParam, value: number): void => {
		if (!ctx) return;
		param.setTargetAtTime(value, ctx.currentTime, SMOOTH);
	};

	function applyVolumes(): void {
		if (!g) return;
		const gains = busGains(volumes);
		ramp(g.master.gain, gains.master);
		ramp(g.effects.gain, gains.effects);
		ramp(g.ui.gain, gains.ui);
		publish();
	}

	function applyFlight(): void {
		if (!g || !flight) return;
		ramp(g.roarGain.gain, flight.roarGain);
		ramp(g.roarFilter.frequency, flight.roarCutoff);
		ramp(g.rumbleGain.gain, flight.rumbleGain);
		ramp(g.rumbleOsc.frequency, flight.rumbleFreq);
		ramp(g.windGain.gain, flight.windGain);
		ramp(g.windFilter.frequency, flight.windCutoff);
		ramp(g.hissGain.gain, flight.hissGain);
	}

	function build(c: AudioContext): Graph {
		const master = c.createGain();
		master.gain.value = 0;
		const compressor = c.createDynamicsCompressor();
		master.connect(compressor).connect(c.destination);
		const effects = c.createGain();
		const ui = c.createGain();
		effects.connect(master);
		ui.connect(master);

		const noise = c.createBuffer(1, Math.floor(c.sampleRate * NOISE_SECONDS), c.sampleRate);
		noise.copyToChannel(noiseSamples(noise.length) as Float32Array<ArrayBuffer>, 0);
		const noiseSource = (offset: number): AudioBufferSourceNode => {
			const src = c.createBufferSource();
			src.buffer = noise;
			src.loop = true;
			src.start(0, offset);
			return src;
		};

		const roarFilter = c.createBiquadFilter();
		roarFilter.type = 'lowpass';
		roarFilter.frequency.value = 250;
		const roarGain = c.createGain();
		roarGain.gain.value = 0;
		noiseSource(0).connect(roarFilter).connect(roarGain).connect(effects);

		// The structure-borne rumble: a low sine plus very low-passed noise.
		const rumbleGain = c.createGain();
		rumbleGain.gain.value = 0;
		const rumbleOsc = c.createOscillator();
		rumbleOsc.type = 'sine';
		rumbleOsc.frequency.value = 38;
		rumbleOsc.start();
		const rumbleNoise = c.createBiquadFilter();
		rumbleNoise.type = 'lowpass';
		rumbleNoise.frequency.value = 70;
		const rumbleNoiseGain = c.createGain();
		rumbleNoiseGain.gain.value = 1.6;
		rumbleOsc.connect(rumbleGain);
		noiseSource(0.7).connect(rumbleNoise).connect(rumbleNoiseGain).connect(rumbleGain);
		rumbleGain.connect(effects);

		const windFilter = c.createBiquadFilter();
		windFilter.type = 'lowpass';
		windFilter.frequency.value = 400;
		// Brown noise is dark; a lowpass that opens with speed passes enough of it to read as a rush.
		const windBoost = c.createGain();
		windBoost.gain.value = 3;
		const windGain = c.createGain();
		windGain.gain.value = 0;
		noiseSource(1.3).connect(windFilter).connect(windBoost).connect(windGain).connect(effects);

		// RCS hiss (plan 211): the bright part of the noise, by the thrusters' firing
		const hissFilter = c.createBiquadFilter();
		hissFilter.type = 'highpass';
		hissFilter.frequency.value = 1800;
		const hissGain = c.createGain();
		hissGain.gain.value = 0;
		noiseSource(2.1).connect(hissFilter).connect(hissGain).connect(effects);

		return {
			master,
			effects,
			ui,
			roarGain,
			roarFilter,
			rumbleGain,
			rumbleOsc,
			windGain,
			windFilter,
			hissGain,
			noise
		};
	}

	function unlock(): void {
		if (disposed) return;
		if (ctx === null) {
			let made: AudioContext | null = null;
			try {
				made = env.createContext();
			} catch {
				made = null;
			}
			if (made === null) return;
			ctx = made;
			// A phone call, Siri or a lock screen moves Safari's context to `interrupted` with no event
			// of ours; the page state follows it, and the next gesture resumes it (plan 055).
			ctx.onstatechange = publish;
			g = build(ctx);
			applyVolumes();
			applyFlight();
		}
		// `suspended` is ours (hidden tab) or the autoplay lock; `interrupted` is the system's (Safari,
		// MDN BaseAudioContext.state). Either way a gesture is the moment to ask for sound again.
		const state: string = ctx.state;
		if (env.visible() && (state === 'suspended' || state === 'interrupted'))
			void ctx.resume().then(publish, publish);
		publish();
	}

	const offGesture = env.onGesture(unlock);
	const offVisibility = env.onVisibility((visible) => {
		if (ctx === null || disposed) return;
		if (visible) void ctx.resume().then(publish, publish);
		else void ctx.suspend().then(publish, publish);
	});
	publish();

	function shot(
		make: (c: AudioContext, out: GainNode, end: (nodes: AudioNode[]) => void) => void,
		bus: 'effects' | 'ui'
	): void {
		if (!ctx || !g || ctx.state !== 'running' || volumes.muted) return;
		const out = ctx.createGain();
		out.connect(g[bus]);
		shots++;
		let done = false;
		make(ctx, out, (nodes) => {
			if (done) return;
			done = true;
			shots--;
			for (const n of nodes) n.disconnect();
			out.disconnect();
		});
	}

	/** A short enveloped oscillator; disconnects itself when it ends. */
	function tone(
		type: OscillatorType,
		from: number,
		to: number,
		start: number,
		length: number,
		peak: number,
		bus: 'effects' | 'ui'
	): void {
		shot((c, out, end) => {
			const t = c.currentTime + start;
			const osc = c.createOscillator();
			osc.type = type;
			osc.frequency.setValueAtTime(from, t);
			if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + length);
			out.gain.setValueAtTime(0.0001, t);
			out.gain.linearRampToValueAtTime(peak, t + 0.005);
			out.gain.exponentialRampToValueAtTime(0.0001, t + length);
			osc.connect(out);
			osc.onended = () => end([osc]);
			osc.start(t);
			osc.stop(t + length + 0.02);
		}, bus);
	}

	/** A canopy filling (plan 209): a rush of air rising through a band-pass, then a soft snap. */
	function whoosh(): void {
		shot((c, out, end) => {
			const t = c.currentTime;
			const air = c.createBufferSource();
			air.buffer = g!.noise;
			const band = c.createBiquadFilter();
			band.type = 'bandpass';
			band.Q.value = 1.4;
			band.frequency.setValueAtTime(300, t);
			band.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
			const swell = c.createGain();
			swell.gain.setValueAtTime(0.0001, t);
			swell.gain.linearRampToValueAtTime(0.8, t + 0.3);
			swell.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
			air.connect(band).connect(swell).connect(out);
			out.gain.value = 1;
			air.onended = () => end([air, band, swell]);
			air.start(t, 0.4);
			air.stop(t + 0.72);
		}, 'effects');
		tone('sine', 140, 60, 0.42, 0.18, 0.5, 'effects');
	}

	function thunk(): void {
		shot((c, out, end) => {
			const t = c.currentTime;
			const osc = c.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(95, t);
			osc.frequency.exponentialRampToValueAtTime(34, t + 0.28);
			const body = c.createGain();
			body.gain.setValueAtTime(0.9, t);
			body.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
			osc.connect(body).connect(out);
			const burst = c.createBufferSource();
			burst.buffer = g!.noise;
			const lp = c.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 700;
			const crack = c.createGain();
			crack.gain.setValueAtTime(0.7, t);
			crack.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
			burst.connect(lp).connect(crack).connect(out);
			out.gain.value = 1;
			osc.onended = () => end([osc, body, burst, lp, crack]);
			osc.start(t);
			osc.stop(t + 0.35);
			burst.start(t, 0.2);
			burst.stop(t + 0.16);
		}, 'effects');
	}

	return {
		get state() {
			return stateNow();
		},
		get activeShots() {
			return shots;
		},
		setVolumes(v) {
			volumes = { ...v };
			applyVolumes();
		},
		setFlight(sound) {
			flight = sound;
			applyFlight();
		},
		oneShot(kind) {
			switch (kind) {
				case 'click':
					tone('sine', 1100, 700, 0, 0.035, 0.35, 'ui');
					break;
				case 'sasOn':
					tone('triangle', 700, 1250, 0, 0.07, 0.4, 'ui');
					break;
				case 'sasOff':
					tone('triangle', 1000, 520, 0, 0.07, 0.4, 'ui');
					break;
				case 'stage':
					thunk();
					break;
				case 'chute':
					whoosh();
					break;
				case 'warning':
					tone('square', 880, 880, 0, 0.12, 0.18, 'effects');
					tone('square', 880, 880, 0.18, 0.12, 0.18, 'effects');
					break;
			}
		},
		level() {
			if (!ctx || !g) return 0;
			if (!analyser) {
				analyser = ctx.createAnalyser();
				analyser.fftSize = 1024;
				g.master.connect(analyser);
				samples = new Float32Array(analyser.fftSize);
			}
			analyser.getFloatTimeDomainData(samples!);
			let sum = 0;
			for (const x of samples!) sum += x * x;
			return Math.sqrt(sum / samples!.length);
		},
		dispose() {
			disposed = true;
			offGesture();
			offVisibility();
			if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
			ctx = null;
			g = null;
		}
	};
}

/** The page's environment: listeners on `window` and `document`, `AudioContext` if the browser has one. */
export function browserAudioEnv(): AudioEnv {
	return {
		createContext() {
			// Safari has had the unprefixed constructor since 14.1; the support floor is 16 (ADR 0040).
			return typeof AudioContext === 'function'
				? new AudioContext({ latencyHint: 'interactive' })
				: null;
		},
		onGesture(fn) {
			const events = ['pointerup', 'keydown'] as const;
			for (const e of events) window.addEventListener(e, fn, { capture: true, passive: true });
			return () => {
				for (const e of events) window.removeEventListener(e, fn, { capture: true });
			};
		},
		onVisibility(fn) {
			const on = (): void => fn(document.visibilityState === 'visible');
			document.addEventListener('visibilitychange', on);
			return () => document.removeEventListener('visibilitychange', on);
		},
		visible: () => document.visibilityState === 'visible',
		publish(state) {
			document.documentElement.dataset.audio = state;
		}
	};
}
