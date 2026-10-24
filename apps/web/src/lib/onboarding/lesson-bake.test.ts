/** Plan 379 (ADR 0355): the baked lesson vessels and facts are what the builders make today. */
import { loadPlugins } from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { DESIGNS, LESSON_FACTS } from '../../../../../mods/stock/src/lessons/designs.generated';
import { bakeLessonDesigns, lessonFacts } from './lesson-bake';

const { registries } = loadPlugins([Stock]);

describe('baked lessons', () => {
	it('the lesson vessels equal a fresh build (run bun scripts/bake-lesson-designs.ts after changing one)', () => {
		const fresh = bakeLessonDesigns({ parts: registries.parts, modules: registries.modules });
		expect(JSON.parse(JSON.stringify(DESIGNS))).toEqual(JSON.parse(JSON.stringify(fresh)));
	});

	it("the lesson texts' numbers equal the stock system's facts", () => {
		expect(LESSON_FACTS).toEqual(lessonFacts([SunBody, HomeBody, MoonBody]));
	});

	it('stock registers every lesson of the Lessons page under stock.<id>', () => {
		const ids = registries.lessons.list().map((l) => l.id);
		expect(ids.length).toBeGreaterThanOrEqual(15);
		expect(ids.every((id) => id.startsWith('stock.'))).toBe(true);
	});
});
