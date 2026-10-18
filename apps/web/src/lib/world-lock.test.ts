/** Plan 204 / ADR 0201 point 12: the second tab is blocked; Take over moves the lock. */
import { describe, expect, it } from 'vitest';
import { createWorldLock, type ChannelLike } from './world-lock';

/** An in-memory BroadcastChannel: every other channel of the same name gets each message. */
function bus() {
	const open: Array<{ name: string; ch: ChannelLike }> = [];
	const timers: Array<() => void> = [];
	return {
		channel(name: string): ChannelLike {
			const ch: ChannelLike = {
				onmessage: null,
				postMessage(data) {
					for (const o of open) if (o.name === name && o.ch !== ch) o.ch.onmessage?.({ data });
				},
				close() {
					const i = open.findIndex((o) => o.ch === ch);
					if (i >= 0) open.splice(i, 1);
				}
			};
			open.push({ name, ch });
			return ch;
		},
		setTimer: (fn: () => void) => void timers.push(fn),
		flush() {
			for (const fn of timers.splice(0)) fn();
		}
	};
}

describe('world lock', () => {
	it('the first tab holds the world, a second one is blocked', () => {
		const b = bus();
		const first = createWorldLock({ worldId: 'w', tab: 'a', ...b, channel: b.channel });
		b.flush();
		expect(first.state).toBe('held');
		const second = createWorldLock({ worldId: 'w', tab: 'b', ...b, channel: b.channel });
		expect(second.state).toBe('blocked');
		b.flush();
		expect(second.state).toBe('blocked');
	});

	it('take over moves the lock; the first tab is blocked then', () => {
		const b = bus();
		const first = createWorldLock({ worldId: 'w', tab: 'a', ...b, channel: b.channel });
		b.flush();
		const second = createWorldLock({ worldId: 'w', tab: 'b', ...b, channel: b.channel });
		second.takeOver();
		expect(second.state).toBe('held');
		expect(first.state).toBe('blocked');
	});

	it('another world is not blocked; a released lock is taken by the waiting tab', () => {
		const b = bus();
		const first = createWorldLock({ worldId: 'w', tab: 'a', ...b, channel: b.channel });
		b.flush();
		const other = createWorldLock({ worldId: 'v', tab: 'b', ...b, channel: b.channel });
		b.flush();
		expect(other.state).toBe('held');
		const waiting = createWorldLock({ worldId: 'w', tab: 'c', ...b, channel: b.channel });
		expect(waiting.state).toBe('blocked');
		first.release();
		b.flush();
		expect(waiting.state).toBe('held');
	});
});
