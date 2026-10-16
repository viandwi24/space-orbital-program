import { afterAll, beforeAll, expect, test } from 'bun:test';
import { newRig, type Rig } from './helpers.ts';

let rig: Rig;
beforeAll(async () => {
	rig = await newRig();
	// Host-side sentinels a leaking sandbox could reach.
	Object.assign(globalThis, { world: 'host-world', hostSecret: 'host-secret' });
});
afterAll(() => {
	Reflect.deleteProperty(globalThis, 'world');
	Reflect.deleteProperty(globalThis, 'hostSecret');
	rig.sim.dispose();
});

/** Runs `source` (which must `print` its findings) and returns the printed lines. */
async function probe(source: string): Promise<string[]> {
	const runner = await rig.runner(source);
	runner.tick(rig.sim.snapshot());
	expect(runner.error).toBeUndefined();
	expect(runner.status).toBe('finished');
	return [...runner.logs];
}

test('world, fetch, DOM and runtime globals do not exist in the guest', async () => {
	const names = [
		'world',
		'fetch',
		'window',
		'document',
		'self',
		'postMessage',
		'importScripts',
		'XMLHttpRequest',
		'WebSocket',
		'localStorage',
		'navigator',
		'process',
		'Bun',
		'require',
		'module',
		'console',
		'setTimeout',
		'setInterval',
		'queueMicrotask',
		'performance',
		'hostSecret',
		'host',
		'sim',
		'globalThis.world'
	];
	const lines = await probe(
		`for (const n of ${JSON.stringify(names)}) print(n + ':' + typeof globalThis[n.replace('globalThis.', '')]);`
	);
	expect(lines).toEqual(names.map((n) => `${n}:undefined`));
});

test('direct references to forbidden names throw ReferenceError', async () => {
	const lines = await probe(`
		for (const f of [() => world, () => fetch('http://example.com'), () => document.body, () => window.top, () => process.env, () => Bun.file('x')]) {
			try { f(); print('reached'); } catch (e) { print(e.name); }
		}
	`);
	expect(lines).toEqual(Array(6).fill('ReferenceError'));
});

test('escape tricks only ever reach the guest global', async () => {
	const lines = await probe(`
		const viaFunction = Function('return this')();
		const viaCtor = (() => {}).constructor('return this')();
		const viaObject = ({}).constructor.constructor('return globalThis')();
		const viaAsync = (async () => {}).constructor('return this')();
		print(viaFunction === globalThis, viaCtor === globalThis, viaObject === globalThis);
		for (const g of [viaFunction, viaCtor, viaObject]) {
			print(['world', 'fetch', 'process', 'hostSecret', 'host', 'document'].filter((n) => n in g).join('|') || 'none');
		}
		print(typeof viaAsync);
		print(String(eval('typeof world + typeof fetch')));
		print(typeof (0, eval)('this').hostSecret);
		try { ({}).__proto__.constructor.constructor('return process')(); print('reached'); } catch (e) { print(e.name); }
		try { new Function('return import("fs")')(); print('no-throw'); } catch (e) { print(e.name); }
	`);
	expect(lines).toEqual([
		'true true true',
		'none',
		'none',
		'none',
		'object',
		'undefinedundefined',
		'undefined',
		'ReferenceError',
		'no-throw'
	]);
});

test('the host bridge is not reachable: ship has only the documented surface', async () => {
	const lines = await probe(`
		print(Object.getOwnPropertyNames(globalThis).filter((n) => !/^[A-Z]/.test(n)).sort().join(','));
		print(Object.keys(ship).sort().join(','));
		print(Object.isFrozen(ship));
	`);
	// Lower-case globals: ECMAScript functions plus the documented script API, nothing else.
	expect(lines[0]).toBe(
		'action,bodies,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,escape,eval,globalThis,isFinite,isNaN,nextTick,parseFloat,parseInt,print,ship,stage,time,undefined,unescape,wait,waitUntil,warp'
	);
	expect(lines[1]).toBe(
		'altitude,apoapsis,attitude,body,bodyRadius,eccentricity,engines,inertia,mass,mode,mu,nose,orbit,orientation,parts,periapsis,position,refusals,speed,t,throttle,up,velocity,wheels'
	);
	expect(lines[2]).toBe('true');
});

test('a script cannot address another vessel or issue sim-wide commands', async () => {
	const runner = await rig.runner(`
		try { action(1, 'stock.command', 'x'); } catch (e) { print(e.name); }
		ship.throttle = 0.1;
		stage();
	`);
	const result = runner.tick(rig.sim.snapshot());
	const vessel = rig.sim.snapshot().vessels[0]!.id;
	expect(result.commands.every((c) => 'vessel' in c && c.vessel === vessel)).toBe(true);
	// `warp(f)` is the one command without a vessel (ADR 0039); the host gates it.
	expect(result.commands.map((c) => c.type)).not.toContain('load-vessel');
});
