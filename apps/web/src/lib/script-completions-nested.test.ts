import { describe, expect, it } from 'vitest';
import { MEMBERS, NODE_FIELDS } from './script-api';
import { acceptCompletion, completionsAt } from './script-editing';

/** Names offered with the caret at `|`. */
function names(text: string, explicit = false): string[] | null {
	const caret = text.indexOf('|');
	const value = text.replace('|', '');
	return completionsAt(value, caret, explicit)?.items.map((i) => i.name) ?? null;
}
const keys = (path: string): string[] => MEMBERS[path]!.map((e) => e.name);

describe('members below ship', () => {
	it('offers the fields of the target, the orbit, a node, an engine, a wheel and a part', () => {
		expect(names('ship.target.|')).toEqual(keys('ship.target'));
		expect(names('ship.orbit.|')).toEqual(keys('ship.orbit'));
		expect(names('ship.nodes[0].|')).toEqual(keys('ship.nodes[]'));
		expect(names('ship.engines[0].|')).toEqual(keys('ship.engines[]'));
		expect(names('ship.wheels[i].|')).toEqual(keys('ship.wheels[]'));
		expect(names('ship.parts[ship.parts.length - 1].|')).toEqual(keys('ship.parts[]'));
	});
	it('goes a level deeper and filters by prefix', () => {
		expect(names('ship.target.position.|')).toEqual(['x', 'y', 'z']);
		expect(names('ship.nodes[0].vector.|')).toEqual(['x', 'y', 'z']);
		expect(names('ship.parts[0].position.|')).toEqual(['x', 'y', 'z']);
		expect(names('ship.target.approach.rel|')).toEqual(['relativeSpeed']);
		expect(names('ship.orientation.|')).toEqual(['x', 'y', 'z', 'w']);
		expect(names('ship.attitude.|')).toEqual(['pitch', 'yaw', 'roll']);
		expect(names('ship.engines[0].is|')).toEqual(['ispVacuum', 'ispSeaLevel']);
	});
	it('reads spaces and newlines around the dots and brackets', () => {
		expect(names('ship . target . dis|')).toEqual(['distance']);
		expect(names('ship\n\t.nodes[ 0 ]\n\t.pro|')).toEqual(['prograde']);
	});
	it('offers the fields of a body by id, with a string index', () => {
		expect(names("bodies['stock.home'].|")).toEqual(keys('bodies[]'));
		expect(names('bodies[ship.body].orbit.|')).toEqual(keys('bodies[].orbit'));
		expect(names('bodies[id].atmosphere.sc|')).toEqual(['scaleHeight']);
		expect(names('bodies["a.b[c"].st|')).toEqual(['state']);
	});
	it('offers nothing for an unknown receiver, a call result or another root', () => {
		expect(names('ship.altitude.|')).toBeNull();
		expect(names('foo.target.|')).toBeNull();
		expect(names('thing.ship.target.|')).toBeNull();
		expect(names('ship.nodes.at(0).|')).toBeNull();
		expect(names('bodies.|')).toBeNull();
		expect(names('ship.target.nothing|')).toBeNull();
	});
	it('offers nothing in a string or a comment', () => {
		expect(names('"ship.target.|"')).toBeNull();
		expect(names('// ship.orbit.|')).toBeNull();
	});
	it('accepting replaces the typed prefix', () => {
		const text = 'ship.target.dis';
		const c = completionsAt(text, text.length)!;
		expect(acceptCompletion(text, c, c.items[0]!).value).toBe('ship.target.distance');
	});
});

describe('the keys of addNode and setNode', () => {
	it('offers the four keys at the start of the literal and after a comma', () => {
		const all = NODE_FIELDS.map((f) => f.name);
		expect(names('addNode({ |', true)).toEqual(all);
		expect(names('addNode({ p|')).toEqual(['prograde']);
		expect(names('await addNode({ time: time() + 60, |', true)).toEqual([
			'prograde',
			'normal',
			'radial'
		]);
		expect(names('setNode(ship.nodes[0].id, { r|')).toEqual(['radial']);
		expect(names('addNode({\n\ttime: 1,\n\tn|\n})')).toEqual(['normal']);
	});
	it('leaves out keys already written and offers nothing when all are', () => {
		expect(names('addNode({ time: 1, prograde: 2, p|')).toBeNull();
		expect(names('addNode({ time: 1, prograde: 2, normal: 0, radial: 0, |', true)).toBeNull();
	});
	it('does not offer keys in a value position, another call or another object', () => {
		expect(names('addNode({ time: ti|')).toEqual(['time']);
		expect(names('addNode({ time: foo({ p|')).toBeNull();
		expect(names('foo({ pro|')).toBeNull();
		expect(names('setNode({ pro|')).toBeNull();
		expect(names('addNode(pro|')).toBeNull();
	});
	it('accepting a key writes the colon too', () => {
		const text = 'addNode({ pro';
		const c = completionsAt(text, text.length)!;
		expect(acceptCompletion(text, c, c.items[0]!).value).toBe('addNode({ prograde: ');
	});
});
