import { describe, expect, test } from 'bun:test';
import { createEventBus } from '../src/index.ts';

type M = { ping: { n: number }; pong: { s: string } };

describe('event bus', () => {
	test('on / emit delivers payload in subscription order', () => {
		const bus = createEventBus<M>();
		const log: string[] = [];
		bus.on('ping', (e) => log.push(`a${e.n}`));
		bus.on('ping', (e) => log.push(`b${e.n}`));
		bus.on('pong', (e) => log.push(e.s));
		bus.emit('ping', { n: 1 });
		expect(log).toEqual(['a1', 'b1']);
	});

	test('once fires exactly once', () => {
		const bus = createEventBus<M>();
		let count = 0;
		bus.once('ping', () => count++);
		bus.emit('ping', { n: 1 });
		bus.emit('ping', { n: 2 });
		expect(count).toBe(1);
	});

	test('off and the returned unsubscribe both remove a handler', () => {
		const bus = createEventBus<M>();
		let count = 0;
		const h = () => count++;
		bus.on('ping', h);
		bus.off('ping', h);
		bus.emit('ping', { n: 1 });
		const unsub = bus.on('ping', h);
		unsub();
		bus.emit('ping', { n: 1 });
		expect(count).toBe(0);
	});

	test('off removes a once handler before it fires', () => {
		const bus = createEventBus<M>();
		let count = 0;
		const h = () => count++;
		bus.once('ping', h);
		bus.off('ping', h);
		bus.emit('ping', { n: 1 });
		expect(count).toBe(0);
	});

	test('handlers removed during emit are skipped; added ones wait for the next emit', () => {
		const bus = createEventBus<M>();
		const log: string[] = [];
		const second = () => log.push('second');
		bus.on('ping', () => {
			log.push('first');
			bus.off('ping', second);
			bus.on('ping', () => log.push('late'));
		});
		bus.on('ping', second);
		bus.emit('ping', { n: 1 });
		expect(log).toEqual(['first']);
		bus.emit('ping', { n: 2 });
		expect(log).toEqual(['first', 'first', 'late']);
	});

	test('the same handler is not subscribed twice', () => {
		const bus = createEventBus<M>();
		let count = 0;
		const h = () => count++;
		bus.on('ping', h);
		bus.on('ping', h);
		bus.emit('ping', { n: 1 });
		expect(count).toBe(1);
	});

	test('a throwing handler propagates to the emitter', () => {
		const bus = createEventBus<M>();
		bus.on('ping', () => {
			throw new Error('boom');
		});
		expect(() => bus.emit('ping', { n: 1 })).toThrow('boom');
	});
});
