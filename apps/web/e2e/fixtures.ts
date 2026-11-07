/**
 * The e2e suite's `test`, muted on every engine (owner, 2026-11-08: automated test browsers make no
 * sound; the game itself keeps its audio when played). Chromium and Firefox are muted in
 * `playwright.config.ts`; WebKit has no mute switch, so its pages get an init script that routes Web
 * Audio through a silent gain and mutes media elements. The audio graph still runs, so audio tests
 * still see their nodes and parameters. Import from here instead of `@playwright/test`.
 */
import { test as base } from '@playwright/test';

export * from '@playwright/test';

/** Runs in the page before any game script (WebKit only). */
export const MUTE_PAGE_SCRIPT = `(() => {
	const silence = (Ctx) => {
		if (!Ctx || Ctx.__orbitalMuted) return;
		const desc = Object.getOwnPropertyDescriptor(Ctx.prototype, 'destination')
			|| Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination');
		if (!desc || !desc.get) return;
		const real = desc.get;
		const silent = new WeakMap();
		Object.defineProperty(Ctx.prototype, 'destination', {
			configurable: true,
			get() {
				const out = real.call(this);
				if (typeof OfflineAudioContext !== 'undefined' && this instanceof OfflineAudioContext) return out;
				let g = silent.get(this);
				if (!g) {
					g = this.createGain();
					g.gain.value = 0;
					g.connect(out);
					for (const k of ['maxChannelCount', 'channelCount', 'channelCountMode', 'channelInterpretation'])
						try { Object.defineProperty(g, k, { get: () => out[k], set: (v) => { out[k] = v; } }); } catch {}
					silent.set(this, g);
				}
				return g;
			}
		});
		Ctx.__orbitalMuted = true;
	};
	silence(window.AudioContext);
	silence(window.webkitAudioContext);
	const play = HTMLMediaElement.prototype.play;
	HTMLMediaElement.prototype.play = function (...a) { this.muted = true; return play.apply(this, a); };
})();`;

export const test = base.extend({
	context: async ({ context, browserName }, use) => {
		if (browserName === 'webkit') await context.addInitScript(MUTE_PAGE_SCRIPT);
		await use(context);
	}
});
