/// <reference lib="webworker" />
/**
 * The planning Worker (plan 118, ADR 0163 point 1): comms planning off the sim Worker (ADR 0101
 * point 2). It answers one request at a time from snapshot data; it never imports `@orbital/sim`.
 */
import { answer, type PlanMessage, type PlanReply } from './protocol';

self.onmessage = (e: MessageEvent<PlanMessage>) => {
	const { id, request } = e.data;
	let reply: PlanReply;
	try {
		reply = { id, ok: true, result: answer(request) };
	} catch (err) {
		reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
	}
	self.postMessage(reply);
};
