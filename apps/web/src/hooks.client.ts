/**
 * Client hooks (plan 202): every uncaught error and unhandled rejection goes to the log buffer and
 * raises the error card (`lib/fatal-error.svelte.ts`); a navigation error SvelteKit catches is
 * logged and keeps its own error page.
 */
import type { HandleClientError, ClientInit } from '@sveltejs/kit';
import { describeError, listenForFatal } from './lib/fatal-error.svelte';
import { logBuffer } from './lib/log-buffer';

export const init: ClientInit = () => {
	listenForFatal(window);
};

export const handleError: HandleClientError = ({ error, status, message }) => {
	logBuffer.add('error', 'navigation', `${status}: ${describeError(error)}`);
	return { message };
};
