/**
 * Plan 390 (ADR 0334): a part that has a seat inside it (an `inner` attach node) must be hollow,
 * or what rides there is a solid body overlapping the part's own collider and the first contact
 * step throws both. Petals are hollow only once their panels are gone, a bay from the start.
 */
import { expect, test } from 'bun:test';
import { parseModuleConfig } from '@orbital/sdk';
import { loaded } from './helpers.ts';

test('every part with an inner node has a module whose hollow() holds once its doors are open', () => {
	const opened = { open: true, jettisoned: true };
	const solid: string[] = [];
	for (const part of loaded.registries.parts.list()) {
		if (!part.attach || !('inner' in part.attach)) continue;
		const hollow = (part.modules ?? []).some(([moduleId, config]) => {
			const module = loaded.registries.modules.get(moduleId);
			if (!module?.hollow) return false;
			const parsed = parseModuleConfig(module, config);
			return parsed.ok && module.hollow(parsed.value as never, opened as never);
		});
		if (!hollow) solid.push(part.id);
	}
	expect(solid).toEqual([]);
});
