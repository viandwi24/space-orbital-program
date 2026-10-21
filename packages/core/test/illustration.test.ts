/** Plan 317 (ADR 0273 point 4): a preset's and a system variant's optional card art. */
import { describe, expect, it } from 'bun:test';
import {
	MAX_ILLUSTRATION_CHARS,
	illustrationSchema,
	presetDefinitionSchema,
	systemVariantDefinitionSchema
} from '../src/index.ts';

const svg = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22/%3E';

describe('illustrationSchema', () => {
	it('takes SVG, PNG, WebP and JPEG data URLs', () => {
		for (const url of [
			svg,
			'data:image/png;base64,iVBORw0KGgo=',
			'data:image/webp;base64,UklGRg==',
			'data:image/jpeg;base64,/9j/4AAQ'
		])
			expect(illustrationSchema.safeParse(url).success).toBe(true);
	});
	it('refuses a link, another media type and an oversized image', () => {
		expect(illustrationSchema.safeParse('https://example.com/a.png').success).toBe(false);
		expect(illustrationSchema.safeParse('data:text/html,<script>').success).toBe(false);
		expect(
			illustrationSchema.safeParse('data:image/png;base64,' + 'A'.repeat(MAX_ILLUSTRATION_CHARS))
				.success
		).toBe(false);
	});
	it('presets and system variants carry it as optional fields', () => {
		const preset = { id: 'mod.mode', label: 'Mode', illustration: svg, icon: svg };
		expect(presetDefinitionSchema.parse(preset)).toMatchObject({ illustration: svg, icon: svg });
		expect(presetDefinitionSchema.safeParse({ ...preset, icon: 'nope' }).success).toBe(false);
		const variant = {
			id: 'mod.v',
			system: 'mod',
			variant: 'default',
			label: 'Mod system',
			description: 'A system',
			home: 'mod.home',
			facts: { dvToOrbit: 3000 },
			illustration: svg
		};
		expect(systemVariantDefinitionSchema.parse(variant).illustration).toBe(svg);
		expect(
			systemVariantDefinitionSchema.parse({ ...variant, illustration: undefined }).illustration
		).toBeUndefined();
	});
});
