import { describe, expect, it } from 'vitest';
import { parseEditorOptions } from './editor-options';

describe('editor options', () => {
	it('is off by default and for anything that is not valid options', () => {
		for (const text of [null, '', 'garbage', '[]', '3', 'null', '{"autoClose":"yes"}', '{}']) {
			expect(parseEditorOptions(text), String(text)).toEqual({ autoClose: false });
		}
	});
	it('reads a stored choice', () => {
		expect(parseEditorOptions('{"autoClose":true}')).toEqual({ autoClose: true });
		expect(parseEditorOptions('{"autoClose":false,"other":1}')).toEqual({ autoClose: false });
	});
});
