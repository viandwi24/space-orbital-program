/** Plan 204 / ADR 0201 point 1: one sim client per world, reused by every page, ended on leaving. */
import { describe, expect, it } from 'vitest';
import { createSimClient, type WorkerLike } from './sim-client';
import { createWorldSession, type SimBoot } from './world-session';

function harness() {
	const started: Array<{ boot: SimBoot; terminated: boolean }> = [];
	const session = createWorldSession((boot) => {
		const entry = { boot, terminated: false };
		started.push(entry);
		const worker: WorkerLike = {
			postMessage: () => {},
			onmessage: null,
			onerror: null,
			terminate: () => void (entry.terminated = true)
		};
		return createSimClient(worker);
	});
	return { session, started };
}

describe('world session', () => {
	it('two page mounts in a row reuse one sim client', async () => {
		const { session, started } = harness();
		const a = await session.acquire('w-1', async () => ({}));
		const b = await session.acquire('w-1', async () => ({ world: undefined }));
		expect(b).toBe(a);
		expect(started).toHaveLength(1);
	});

	it('concurrent mounts share the one boot', async () => {
		const { session, started } = harness();
		const [a, b] = await Promise.all([
			session.acquire('w-1', async () => ({})),
			session.acquire('w-1', async () => ({}))
		]);
		expect(b).toBe(a);
		expect(started).toHaveLength(1);
	});

	it('leaving to Home terminates it; the next open boots again', async () => {
		const { session, started } = harness();
		await session.acquire('w-1', async () => ({}));
		session.end();
		expect(started[0]!.terminated).toBe(true);
		expect(session.client).toBeNull();
		await session.acquire('w-1', async () => ({}));
		expect(started).toHaveLength(2);
	});

	it('another world ends the first; a restart replaces the sim', async () => {
		const { session, started } = harness();
		await session.acquire('w-1', async () => ({}));
		await session.acquire('w-2', async () => ({}));
		expect(started[0]!.terminated).toBe(true);
		expect(session.worldId).toBe('w-2');
		session.restart('w-2', {});
		expect(started[1]!.terminated).toBe(true);
		expect(started).toHaveLength(3);
	});
});
