/**
 * The sim Worker's end of the channel to the script Worker (ADR 0038): the script Worker lives in
 * the page's sandbox iframe, the page made a `MessageChannel` and transferred one port here. This
 * adapter gives the session the `ScriptWorkerLike` it expects. Killing the Worker is the page's
 * job (it removes the iframe when the script ends: a status other than `starting`/`running`);
 * `terminate()` here closes the port, so nothing more is sent or heard.
 */
import type { ScriptPortLike } from './messages';
import type { ScriptWorkerLike } from './script-protocol';

export function scriptWorkerOverPort(port: ScriptPortLike): ScriptWorkerLike {
	let onmessage: ScriptWorkerLike['onmessage'] = null;
	return {
		postMessage: (message) => port.postMessage(message),
		get onmessage() {
			return onmessage;
		},
		set onmessage(handler) {
			onmessage = handler;
			port.onmessage = handler ? (event) => handler({ data: event.data }) : null;
		},
		// A MessagePort has no error event; a Worker that dies is noticed by the iframe (reported
		// to the page) and by the session's deadlines.
		onerror: null,
		terminate: () => {
			port.onmessage = null;
			port.close();
		}
	};
}
