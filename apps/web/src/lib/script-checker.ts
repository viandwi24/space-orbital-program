/**
 * The syntax check before Run (plan 058, ADR 0085): the page keeps a second script sandbox, opened
 * on the first check and closed after a quiet spell, and asks its Worker to compile the script
 * without running it. The answer is the engine's own error with the player's line. This sandbox is
 * the same one a Run uses (`createScriptSandbox`: sandboxed iframe, no network, ADR 0038); it never
 * hands its port to the sim Worker, so nothing a script does can come from here.
 */
import { parseFromScriptWorker, MAX_CHECK_CHARS } from './script-protocol';

export type SyntaxProblem = { message: string; line?: number; column?: number };

export interface CheckerDeps {
	/** Start a fresh sandbox and return the port of its Worker (`ScriptSandbox.open`). */
	open(): Promise<MessagePort>;
	/** Remove the sandbox (`ScriptSandbox.close`). */
	close(): void;
	/** Close the sandbox after this long without a check, ms. */
	idleMs?: number;
	/** Give up on one answer after this long, ms. */
	answerTimeoutMs?: number;
	/** After the sandbox failed to start, do not try again for this long, ms. */
	retryAfterMs?: number;
	now?(): number;
}

export interface ScriptChecker {
	/**
	 * The syntax error of `source`, `null` for none. A check that was overtaken by a newer one, that
	 * the sandbox could not answer, or for a source too long to check, also gives `undefined`:
	 * there is no answer to show.
	 */
	check(source: string): Promise<SyntaxProblem | null | undefined>;
	/** Close the sandbox now (the panel was closed). Idempotent; the next check reopens it. */
	close(): void;
}

export const CHECK_IDLE_MS = 30_000;
export const CHECK_ANSWER_TIMEOUT_MS = 5_000;
export const CHECK_RETRY_MS = 10_000;

export function createScriptChecker(deps: CheckerDeps): ScriptChecker {
	const idleMs = deps.idleMs ?? CHECK_IDLE_MS;
	const answerTimeoutMs = deps.answerTimeoutMs ?? CHECK_ANSWER_TIMEOUT_MS;
	const retryAfterMs = deps.retryAfterMs ?? CHECK_RETRY_MS;
	const now = deps.now ?? (() => Date.now());
	let port: Promise<MessagePort> | null = null;
	let idle: ReturnType<typeof setTimeout> | undefined;
	let failedAt = -Infinity;
	let nextId = 1;
	/** Resolvers of the checks in flight, by id. */
	const waiting = new Map<number, (answer: SyntaxProblem | null | undefined) => void>();

	function settleAll(): void {
		for (const resolve of waiting.values()) resolve(undefined);
		waiting.clear();
	}
	function close(): void {
		clearTimeout(idle);
		idle = undefined;
		const open = port;
		port = null;
		if (open) {
			void open.then((p) => (p.onmessage = null)).catch(() => {});
			deps.close();
		}
		settleAll();
	}
	function connect(): Promise<MessagePort> {
		if (port) return port;
		const opened = deps.open().then((p) => {
			p.onmessage = (event: MessageEvent) => {
				const message = parseFromScriptWorker(event.data);
				if (!message || message.kind !== 'checked') return;
				const resolve = waiting.get(message.id);
				if (!resolve) return;
				waiting.delete(message.id);
				// Only the newest check's answer is of use.
				resolve(
					message.id !== nextId - 1
						? undefined
						: message.ok
							? null
							: {
									message: message.message,
									...(message.line === undefined ? {} : { line: message.line }),
									...(message.column === undefined ? {} : { column: message.column })
								}
				);
			};
			return p;
		});
		port = opened;
		opened.catch(() => {
			if (port === opened) {
				port = null;
				deps.close();
			}
			failedAt = now();
		});
		return opened;
	}

	return {
		async check(source) {
			if (source.length > MAX_CHECK_CHARS) return undefined;
			if (now() - failedAt < retryAfterMs) return undefined;
			// A newer check overtakes the ones still waiting: only the latest answer is of use.
			settleAll();
			let p: MessagePort;
			try {
				p = await connect();
			} catch {
				return undefined;
			}
			clearTimeout(idle);
			idle = setTimeout(close, idleMs);
			const id = nextId++;
			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					waiting.delete(id);
					resolve(undefined);
				}, answerTimeoutMs);
				waiting.set(id, (answer) => {
					clearTimeout(timer);
					resolve(answer);
				});
				p.postMessage({ kind: 'check', id, source });
			});
		},
		close
	};
}
