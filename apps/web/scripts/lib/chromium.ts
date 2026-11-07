/**
 * Playwright's Chromium for the measuring and capture scripts, always muted (owner, 2026-11-08: automated
 * test browsers make no sound; the game itself, played locally or in production, keeps its audio).
 * Import `chromium` from here instead of `@playwright/test`; everything else is re-exported unchanged.
 */
import { chromium as base } from '@playwright/test';

export * from '@playwright/test';

export const MUTE_ARGS = ['--mute-audio'] as const;

/** The launch options with `--mute-audio` added to `args`, once. */
export function muted<T extends { args?: string[] } | undefined>(
	options: T
): T & { args: string[] } {
	const args = [...(options?.args ?? [])];
	for (const a of MUTE_ARGS) if (!args.includes(a)) args.push(a);
	return { ...(options ?? {}), args } as T & { args: string[] };
}

export const chromium: typeof base = Object.assign(Object.create(base) as typeof base, {
	launch: ((options) => base.launch(muted(options))) as typeof base.launch,
	launchPersistentContext: ((dir, options) =>
		base.launchPersistentContext(dir, muted(options))) as typeof base.launchPersistentContext,
	launchServer: ((options) => base.launchServer(muted(options))) as typeof base.launchServer
});
