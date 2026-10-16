/** The real script sandbox: an iframe in this document, assets from `static/sandbox/` and the bundled `.wasm`. */
import { asset } from '$app/paths';
import quickjsWasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import {
	createScriptSandbox,
	SANDBOX_ATTRIBUTE,
	type SandboxAssets,
	type SandboxFrameHandle,
	type ScriptSandbox
} from './script-sandbox';
import { buildSandboxDocument } from './script-sandbox-document';
import type { Sentinel } from './script-sandbox-probe';

const TEMPLATE_URL = 'sandbox/script-sandbox.html';
const BOOTSTRAP_URL = 'sandbox/script-sandbox-frame-main.js';
const WORKER_URL = 'sandbox/script-sandbox-worker.js';

function createFrame(markup: string): SandboxFrameHandle {
	const iframe = document.createElement('iframe');
	// Scripts only. No `allow-same-origin`: that is what gives the frame an opaque origin.
	iframe.setAttribute('sandbox', SANDBOX_ATTRIBUTE);
	iframe.referrerPolicy = 'no-referrer';
	iframe.title = 'Script sandbox (no content)';
	iframe.setAttribute('aria-hidden', 'true');
	iframe.tabIndex = -1;
	iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
	const loaded = new Promise<void>((resolve, reject) => {
		iframe.addEventListener('load', () => resolve(), { once: true });
		iframe.addEventListener('error', () => reject(new Error('the sandbox page failed to load')), {
			once: true
		});
	});
	loaded.catch(() => {});
	let listener: ((data: unknown) => void) | null = null;
	const onMessage = (event: MessageEvent): void => {
		if (event.source === iframe.contentWindow) listener?.(event.data);
	};
	window.addEventListener('message', onMessage);
	// srcdoc, not src: the frame fetches nothing (and its CSP names its one script by hash).
	iframe.srcdoc = markup;
	document.body.append(iframe);
	return {
		loaded,
		post(message, transfer) {
			// The frame's origin is opaque: "*" is the only target that matches it.
			iframe.contentWindow?.postMessage(message, '*', transfer);
		},
		onEvent(next) {
			listener = next;
		},
		remove() {
			window.removeEventListener('message', onMessage);
			listener = null;
			iframe.remove();
		}
	};
}

async function text(url: Parameters<typeof asset>[0]): Promise<string> {
	const response = await fetch(asset(url));
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status} (run the web build)`);
	return response.text();
}

async function loadAssets(): Promise<SandboxAssets> {
	const [template, bootstrap, workerSource, wasm] = await Promise.all([
		text(TEMPLATE_URL),
		text(BOOTSTRAP_URL),
		text(WORKER_URL),
		fetch(quickjsWasmUrl).then((response) => {
			if (!response.ok) throw new Error(`QuickJS wasm: HTTP ${response.status}`);
			return response.arrayBuffer();
		})
	]);
	return { workerSource, wasm, document: await buildSandboxDocument(template, bootstrap) };
}

/**
 * Plant a cookie and a Cache storage entry in this (game) origin for the self-test: a sandbox that
 * can see either is not isolated. Each is kept only if it can be read back here.
 */
async function plantSentinel(): Promise<{ sentinel: Sentinel; remove(): void }> {
	const name = `orbital-probe-${crypto.randomUUID()}`;
	const sentinel: Sentinel = {};
	try {
		document.cookie = `${name}=1; path=/; SameSite=Strict`;
		if (document.cookie.split(/;\s*/).some((c) => c.startsWith(`${name}=`))) sentinel.cookie = name;
	} catch {
		// cookies unavailable here: the cookie probe falls back to the strict reading
	}
	try {
		await caches.open(name);
		sentinel.cache = name;
	} catch {
		// no Cache storage here either
	}
	return {
		sentinel,
		remove() {
			try {
				document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Strict`;
			} catch {
				// nothing to remove
			}
			void caches.delete(name).catch(() => {});
		}
	};
}

export function startScriptSandbox(): ScriptSandbox {
	return createScriptSandbox({
		createFrame,
		loadAssets,
		plantSentinel,
		probeUrl: new URL(asset('robots.txt'), location.href).href
	});
}
