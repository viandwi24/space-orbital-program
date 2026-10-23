/** Every icon name the built-in mods use is drawn, not the part icon fallback (system audit). */
import { loadPlugins } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import { isIconName } from './icons';

describe('icon names of the built-in mods', () => {
	it('panels, action groups and staging icons name icons the set has', () => {
		const { registries } = loadPlugins(BUILTIN_PLUGINS);
		const used = [
			...registries.panels.list().map((p) => p.icon),
			...registries.actionGroups.list().map((g) => g.icon),
			...registries.categories.list().map((c) => c.icon),
			...registries.parts.list().map((p) => p.stagingIcon)
		].filter((n): n is string => typeof n === 'string');
		expect([...new Set(used.filter((n) => !isIconName(n)))]).toEqual([]);
	});
});
