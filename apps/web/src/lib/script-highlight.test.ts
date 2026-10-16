import { describe, expect, it } from 'vitest';
import { highlight } from './script-highlight';

const flat = (source: string) =>
	highlight(source).map((line) => line.map((t) => `${t.kind}:${t.text}`));

describe('script highlight', () => {
	it('colours keywords, API names, numbers and strings', () => {
		expect(flat('const x = ship.altitude + 1e-3; print("a\\"b");')).toEqual([
			[
				'keyword:const',
				'plain: x = ',
				'api:ship',
				'plain:.altitude + ',
				'number:1e-3',
				'plain:; ',
				'api:print',
				'plain:(',
				'string:"a\\"b"',
				'plain:);'
			]
		]);
	});

	it('splits block comments and template strings at newlines', () => {
		expect(flat('/* a\nb */ x\n`t\nu`')).toEqual([
			['comment:/* a'],
			['comment:b */', 'plain: x'],
			['string:`t'],
			['string:u`']
		]);
	});

	it('stops an unterminated string at the line end', () => {
		expect(flat("let s = 'oops\nship.throttle = 1")[1]![0]).toEqual('api:ship');
	});

	it('does not treat a property named like the API or a keyword as one', () => {
		expect(flat('a.ship.if')).toEqual([['plain:a.ship.if']]);
		expect(flat('if(ship)')[0]).toEqual(['keyword:if', 'plain:(', 'api:ship', 'plain:)']);
	});

	it('round-trips: the tokens concatenate back to the source, line count included', () => {
		const source = "// c\nlet a = 0x1F + .5;\nawait wait(2); /* x */\n'a\n`b\n";
		const lines = highlight(source);
		expect(lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(source);
		expect(lines).toHaveLength(source.split('\n').length);
	});

	it('handles the empty script', () => {
		expect(highlight('')).toEqual([[]]);
	});
});
