/**
 * Self-test of the script sandbox (ADR 0038): from inside a context (the sandboxed iframe document,
 * the script Worker) try to reach what a compromised script engine would want in the game's
 * origin (same-origin network, IndexedDB, localStorage, cookies, Cache storage), and report what
 * worked. The result is shown in the script panel; a reachable probe turns the "isolated" line
 * into a warning. The probe never throws and never blocks longer than `timeoutMs` per item.
 *
 * Only an exception or rejection counts as "blocked"; anything that works counts as "reachable",
 * so an inconclusive result errs on the side of the warning.
 */

export type Reach = 'blocked' | 'reachable';

export interface ContainmentReport {
	context: 'frame' | 'worker';
	/** `origin` of the context; an opaque origin is the string "null". */
	origin: string;
	/** True when the context has an opaque origin (no `allow-same-origin`). */
	opaque: boolean;
	probes: Record<string, Reach>;
	/** The game-origin URL the network probe asked for. */
	target: string;
	/** `securitypolicyviolation` events seen while probing (the CSP doing its job). */
	violations: number;
}

/** The slice of a global scope the probe touches (a double in tests). Every member may be missing. */
export interface ProbeScope {
	origin?: string;
	fetch?: (url: string, init?: Record<string, unknown>) => Promise<unknown>;
	indexedDB?: {
		open(name: string): {
			onsuccess: ((event: Event) => void) | null;
			onerror: ((event: Event) => void) | null;
			result?: { close(): void };
		};
		deleteDatabase(name: string): unknown;
	};
	caches?: { open(name: string): Promise<unknown> };
	document?: { cookie: string };
	localStorage?: { getItem(key: string): unknown };
	addEventListener?(type: 'securitypolicyviolation', listener: () => void): void;
}

export interface ProbeOptions {
	context: ContainmentReport['context'];
	/** A URL in the game's own origin (any existing path). */
	target: string;
	timeoutMs?: number;
}

/** Run `step`; a throw, a rejection or a timeout is "blocked", a normal completion "reachable". */
async function attempt(step: () => unknown, timeoutMs: number): Promise<Reach> {
	try {
		const outcome = step();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<'timeout'>((resolve) => {
			timer = setTimeout(() => resolve('timeout'), timeoutMs);
		});
		const settled = await Promise.race([
			Promise.resolve(outcome).then(() => 'ok' as const),
			timeout
		]);
		clearTimeout(timer);
		return settled === 'ok' ? 'reachable' : 'blocked';
	} catch {
		return 'blocked';
	}
}

function openIndexedDb(scope: ProbeScope): Promise<void> {
	return new Promise((resolve, reject) => {
		const idb = scope.indexedDB;
		if (!idb) return reject(new Error('indexedDB is not available'));
		const request = idb.open('orbital-sandbox-probe');
		request.onsuccess = () => {
			request.result?.close();
			idb.deleteDatabase('orbital-sandbox-probe');
			resolve();
		};
		request.onerror = () => reject(new Error('indexedDB.open failed'));
	});
}

export async function probeContainment(
	scope: ProbeScope,
	options: ProbeOptions
): Promise<ContainmentReport> {
	const timeoutMs = options.timeoutMs ?? 1500;
	let violations = 0;
	try {
		scope.addEventListener?.('securitypolicyviolation', () => void (violations += 1));
	} catch {
		// no event support: the counter stays 0
	}
	const origin = typeof scope.origin === 'string' ? scope.origin : 'unknown';
	const probes: Record<string, Reach> = {
		// `no-cors` resolves (opaquely) whenever the request is allowed to leave: only CSP or a
		// network failure rejects it, and the game origin is up.
		fetch: await attempt(() => {
			if (!scope.fetch) throw new Error('fetch is not available');
			return scope.fetch(options.target, { mode: 'no-cors', cache: 'no-store' });
		}, timeoutMs),
		indexedDB: await attempt(() => openIndexedDb(scope), timeoutMs),
		localStorage: await attempt(() => {
			if (!scope.localStorage) throw new Error('localStorage is not available');
			return scope.localStorage.getItem('orbital.design');
		}, timeoutMs),
		cookie: await attempt(() => {
			if (!scope.document) throw new Error('document is not available');
			return scope.document.cookie;
		}, timeoutMs),
		caches: await attempt(() => {
			if (!scope.caches) throw new Error('caches is not available');
			return scope.caches.open('orbital-sandbox-probe');
		}, timeoutMs)
	};
	return {
		context: options.context,
		origin,
		opaque: origin === 'null',
		probes,
		target: options.target,
		violations
	};
}

/** What the page tells the player: every context opaque, nothing reachable. */
export function isContained(reports: readonly ContainmentReport[]): boolean {
	return (
		reports.length > 0 &&
		reports.every((r) => r.opaque && Object.values(r.probes).every((p) => p === 'blocked'))
	);
}

/** Probes that worked, as `context.name`, for the warning text. */
export function reachableProbes(reports: readonly ContainmentReport[]): string[] {
	return reports.flatMap((r) => [
		...(r.opaque ? [] : [`${r.context}.origin=${r.origin}`]),
		...Object.entries(r.probes)
			.filter(([, reach]) => reach === 'reachable')
			.map(([name]) => `${r.context}.${name}`)
	]);
}
