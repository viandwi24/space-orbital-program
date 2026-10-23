/**
 * A mod panel's own UI (plan 330, ADR 0285 point 1): the mod's ES module runs in an iframe with
 * `sandbox="allow-scripts"` (an opaque origin, as the script sandbox, ADR 0038). The frame document
 * is fixed: a bootstrap whose SHA-256 is in the site's policy imports the module from a blob URL
 * and calls its `mount(root, host)`. The page sends the panel input as plain data at each HUD
 * update; the frame sends back commands, which the sim validates like any other.
 */
import type { Command, PanelInput } from '@orbital/core';
import { cspHash } from '../script-sandbox-document';

/**
 * The frame's one script. Plain JavaScript; it must not contain a script terminator. `host` is
 * frozen: `onInput(fn)`, `command(c)`, `resize(px)`, `theme`.
 */
export const MOD_FRAME_BOOTSTRAP = `(() => {
	'use strict';
	const root = document.getElementById('root');
	const listeners = [];
	let last = null;
	let theme = {};
	const post = (m) => parent.postMessage(m, '*');
	const fail = (e) => post({ kind: 'error', message: String((e && e.message) || e) });
	addEventListener('error', (e) => fail(e.error || e.message));
	addEventListener('unhandledrejection', (e) => fail(e.reason));
	const host = Object.freeze({
		onInput(fn) {
			if (typeof fn !== 'function') return;
			listeners.push(fn);
			if (last) fn(last);
		},
		command(c) {
			post({ kind: 'command', command: c });
		},
		resize(px) {
			post({ kind: 'resize', height: Number(px) });
		},
		get theme() {
			return theme;
		}
	});
	addEventListener('message', async (e) => {
		if (e.source !== parent) return;
		const m = e.data;
		if (!m || typeof m !== 'object') return;
		if (m.kind === 'mount') {
			theme = m.theme || {};
			for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty('--' + k, String(v));
			try {
				const url = URL.createObjectURL(new Blob([String(m.source)], { type: 'text/javascript' }));
				const mod = await import(url);
				URL.revokeObjectURL(url);
				if (typeof mod.mount !== 'function') throw new Error('the module exports no mount(root, host)');
				await mod.mount(root, host);
			} catch (err) {
				fail(err);
			}
		} else if (m.kind === 'input') {
			last = m.input;
			for (const fn of listeners) {
				try {
					fn(last);
				} catch (err) {
					fail(err);
				}
			}
		}
	});
	post({ kind: 'ready' });
})();`;

/** The frame's document: its own policy allows the bootstrap (by hash), blob modules and inline styles. */
export async function modFrameDocument(): Promise<string> {
	const hash = await cspHash(MOD_FRAME_BOOTSTRAP);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${hash}' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'" />
<meta name="referrer" content="no-referrer" /><title>Mod panel</title>
<style>html,body{margin:0;padding:0;background:transparent;color:var(--text,#e8eef5);font:12px/1.4 var(--font,system-ui,sans-serif);overflow:hidden}#root{padding:2px}</style>
</head><body><div id="root"></div><script>${MOD_FRAME_BOOTSTRAP}</script></body></html>`;
}

export type FrameMessage =
	| { kind: 'ready' }
	| { kind: 'command'; command: Command }
	| { kind: 'resize'; height: number }
	| { kind: 'error'; message: string };

/** A message from the frame, checked for shape (the sim validates the command itself), or null. */
export function frameMessage(data: unknown): FrameMessage | null {
	if (!data || typeof data !== 'object') return null;
	const m = data as Record<string, unknown>;
	switch (m.kind) {
		case 'ready':
			return { kind: 'ready' };
		case 'command':
			return m.command &&
				typeof m.command === 'object' &&
				typeof (m.command as { type?: unknown }).type === 'string'
				? { kind: 'command', command: m.command as Command }
				: null;
		case 'resize':
			return typeof m.height === 'number' && Number.isFinite(m.height)
				? { kind: 'resize', height: Math.max(40, Math.min(600, Math.round(m.height))) }
				: null;
		case 'error':
			return { kind: 'error', message: String(m.message ?? 'error').slice(0, 300) };
		default:
			return null;
	}
}

/** What the frame gets each update: plain data only (the flown vessel, its target vessel, the time). */
export function frameInput(input: PanelInput): unknown {
	const target = input.vessel?.target;
	const other =
		target?.kind === 'vessel' ? input.snapshot.vessels.find((v) => v.id === target.id) : undefined;
	return JSON.parse(
		JSON.stringify({
			time: input.time,
			altitude: input.altitude,
			speed: input.speed,
			vessel: input.vessel,
			targetVessel: other ?? null
		})
	);
}
