/** Plan 379 (ADR 0355): a plugin registers lessons. */
import { describe, expect, test } from 'bun:test';
import {
	LESSON_FOCUS,
	lessonDefinitionSchema,
	loadPlugins,
	type LessonDefinition,
	type Plugin
} from '../src/index.ts';

const lesson = (id: string): LessonDefinition => ({
	id,
	level: 'basics',
	title: 'Hello',
	summary: 'A first scene.',
	setup: [{ fn: 'send', args: [{ type: 'stage', vessel: LESSON_FOCUS }] }],
	blocked: { actions: { map: 'Not in this lesson.' }, places: { vab: 'Closed.' } },
	steps: [
		{
			id: 'throttle',
			title: 'Throttle up',
			text: 'Press {key:throttleFull}.',
			done: (o) => o.throttle > 0.5
		}
	],
	goal: (o) => o.altitude > 1000,
	debrief: 'Well done.',
	hint: 'Try it in your world.'
});

const plugin = (...ids: string[]): Plugin => ({
	meta: { id: 'sample', version: '1.0.0', api: '^0.1' },
	depends: [],
	optional: [],
	setup(ctx) {
		for (const id of ids) ctx.lessons.register(lesson(id));
	}
});

describe('lessons', () => {
	test('a plugin registers lessons and the report names them by plugin', () => {
		const { registries, report } = loadPlugins([plugin('sample.hello', 'sample.again')]);
		expect(registries.lessons.list().map((l) => l.id)).toEqual(['sample.hello', 'sample.again']);
		expect(registries.lessons.owner('sample.hello')).toBe('sample');
		expect(report.registered.lesson).toEqual([
			{ id: 'sample.hello', by: 'sample' },
			{ id: 'sample.again', by: 'sample' }
		]);
	});

	test('the shape is checked: an id, a level, steps with a done check', () => {
		const ok = lesson('sample.a');
		expect(lessonDefinitionSchema.safeParse(ok).success).toBe(true);
		expect(lessonDefinitionSchema.safeParse({ ...ok, level: 'expert' }).success).toBe(false);
		expect(lessonDefinitionSchema.safeParse({ ...ok, steps: [] }).success).toBe(false);
		expect(
			lessonDefinitionSchema.safeParse({ ...ok, steps: [{ id: 'a', title: 'A', text: 'A' }] })
				.success
		).toBe(false);
		expect(lessonDefinitionSchema.safeParse({ ...ok, setup: [{ fn: '', args: [] }] }).success).toBe(
			false
		);
	});

	test('a lesson with a bad id is refused', () => {
		expect(() => loadPlugins([plugin('Hello')])).toThrow();
	});
});
