/**
 * Two tabs on one world (plan 204, ADR 0201 point 12): a `BroadcastChannel` lock. A tab that opens
 * a world asks whether another tab holds it; if one answers, this tab shows "This world is open in
 * another tab" until the player takes over, which moves the lock and blocks the other tab.
 */

export interface ChannelLike {
	postMessage(message: unknown): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	close(): void;
}

export type LockState = 'asking' | 'held' | 'blocked';

type Message =
	| { kind: 'ask'; tab: string }
	| { kind: 'held'; tab: string }
	| { kind: 'take'; tab: string }
	| { kind: 'release'; tab: string };

export interface WorldLock {
	readonly state: LockState;
	/** Move the lock to this tab; the tab that held it becomes blocked. */
	takeOver(): void;
	/** Give the lock up (leaving the world, closing the tab). */
	release(): void;
	onChange(listener: (state: LockState) => void): () => void;
}

/** How long a tab waits for an answer before it takes the lock, ms. */
export const LOCK_ASK_MS = 250;

export function createWorldLock(options: {
	worldId: string;
	tab: string;
	channel: (name: string) => ChannelLike;
	setTimer?: (fn: () => void, ms: number) => unknown;
}): WorldLock {
	const channel = options.channel(`orbital.world.${options.worldId}`);
	const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const listeners = new Set<(state: LockState) => void>();
	let state: LockState = 'asking';
	let released = false;
	const set = (next: LockState): void => {
		if (next === state) return;
		state = next;
		for (const l of listeners) l(state);
	};
	const post = (m: Message): void => channel.postMessage(m);

	channel.onmessage = (event) => {
		const m = event.data as Message;
		if (released || typeof m !== 'object' || m === null || m.tab === options.tab) return;
		if (m.kind === 'ask' && state === 'held') post({ kind: 'held', tab: options.tab });
		else if (m.kind === 'held' && state === 'asking') set('blocked');
		else if (m.kind === 'take' && state === 'held') set('blocked');
		else if (m.kind === 'release' && state === 'blocked') {
			// the other tab left: ask again, and take the lock when nobody else answers
			set('asking');
			ask();
		}
	};

	function ask(): void {
		post({ kind: 'ask', tab: options.tab });
		setTimer(() => {
			if (state === 'asking' && !released) set('held');
		}, LOCK_ASK_MS);
	}
	ask();

	return {
		get state() {
			return state;
		},
		takeOver() {
			if (released) return;
			post({ kind: 'take', tab: options.tab });
			set('held');
		},
		release() {
			if (released) return;
			released = true;
			if (state === 'held') post({ kind: 'release', tab: options.tab });
			channel.close();
		},
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
