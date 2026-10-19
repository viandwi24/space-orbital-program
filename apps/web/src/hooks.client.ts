/**
 * Client hooks (plan 202): every uncaught error and unhandled rejection goes to the log buffer and
 * raises the error card (`lib/fatal-error.svelte.ts`); a navigation error SvelteKit catches is
 * logged and keeps its own error page.
 */
import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { describeError, listenForFatal } from './lib/fatal-error.svelte';
import { logBuffer } from './lib/log-buffer';

export const init: ClientInit = () => {
	listenForFatal(window);
};

export const handleError: HandleClientError = ({ kind, error }) => {
	// the defaults (status and safe message) stay: SvelteKit's error page shows them
	logBuffer.add('error', 'navigation', `${kind}: ${describeError(error)}`);
};
