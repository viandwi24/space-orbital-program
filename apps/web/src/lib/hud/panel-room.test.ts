import { expect, test } from 'bun:test';
import { panelRoom } from './panel-room';

test('the inspectors leave room for the open vessel panel at any width', () => {
	expect(panelRoom(true, 320)).toBe('20rem');
	expect(panelRoom(false, 320)).toBe('0rem');
});
