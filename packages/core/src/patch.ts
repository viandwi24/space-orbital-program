/**
 * Typed data patches (plan 079, ADRs 0104 and 0170). A plugin registers `PatchDefinition`s during
 * `setup`; `loadPlugins` orders them and applies them once, after every plugin booted and before the
 * part/module cross-check. Patches are plain data plus an optional pure `where` predicate; this file
 * only needs the registries and a per-entry check from the loader.
 */
import type { BuildingDefinition } from './buildings.ts';
import type { CategoryDefinition } from './categories.ts';
import type { BodyDefinition, PartDefinition, ResourceDefinition } from './definitions.ts';
import { replaceDefinition, type Registry } from './registry.ts';

export const PATCH_TARGETS = ['part', 'resource', 'body', 'building', 'category'] as const;
export type PatchTarget = (typeof PATCH_TARGETS)[number];

/** Entry type of each patchable registry kind. */
export interface PatchEntryMap {
	part: PartDefinition;
	resource: ResourceDefinition;
	body: BodyDefinition;
	/** Plan 090 (ADR 0115). */
	building: BuildingDefinition;
	/** Plan 069 (ADR 0146). */
	category: CategoryDefinition;
}

/**
 * Which entries a patch changes. `tag` matches entries whose `tags` array contains it; `where` is a
 * pure predicate over the frozen entry (method syntax keeps it bivariant across targets).
 */
export type PatchSelect<T> =
	| { id: string }
	| { ids: readonly string[] }
	| { tag: string }
	| { where(entry: Readonly<T>): boolean };

/**
 * One operation on a dot-separated path (ADR 0170 point 3). Under a part's `modules` the segment
 * after `modules` is a module id: `modules.stock.engine.thrust`.
 */
export type PatchOp =
	| { op: 'set'; path: string; value: unknown }
	| { op: 'merge'; path: string; value: Readonly<Record<string, unknown>> }
	| { op: 'remove'; path: string }
	| { op: 'append'; path: string; value: unknown }
	| { op: 'insert'; path: string; index: number; value: unknown };

export interface PatchDefinition<K extends PatchTarget = PatchTarget> {
	/** Unique across the load; follows the definition id rule (`sample.engine-thrust`). */
	id: string;
	target: K;
	select: PatchSelect<PatchEntryMap[K]>;
	ops: readonly PatchOp[];
	/** Apply after every patch of these plugins (ids of plugins that are not loaded are ignored). */
	after?: readonly string[];
	/** Apply before every patch of these plugins. */
	before?: readonly string[];
	/** Orders what `after`/`before` leave open; lower first. Default 0. */
	priority?: number;
	title?: string;
}

/** A patch of any target: what `ctx.patches.register` accepts. */
export type AnyPatchDefinition = { [K in PatchTarget]: PatchDefinition<K> }[PatchTarget];

export interface PatchChange {
	entry: string;
	path: string;
	from: unknown;
	to: unknown;
}

export interface PatchReport {
	id: string;
	/** Plugin that registered the patch. */
	by: string;
	target: PatchTarget;
	/** Entry ids the patch changed, in registry order; empty when it selected nothing or is disabled. */
	applied: string[];
	changes: PatchChange[];
	/** Why the patch did not apply; absent when it applied. */
	disabled?: string;
}

/** kind → entry id → path → plugins that set it (registering plugin first, then patchers in order). */
export type Provenance = Record<PatchTarget, Record<string, Record<string, string[]>>>;

/** A registered patch with what the loader knows about where it came from. */
export interface PatchSource {
	def: AnyPatchDefinition;
	by: string;
	/** Boot index of `by`. */
	bootIndex: number;
}

export interface ApplyPatchesInput {
	patches: readonly PatchSource[];
	registries: { [K in PatchTarget]: Registry<PatchEntryMap[K]> };
	/**
	 * Extra check of a patched entry after its schema passed (the loader checks part module configs
	 * here). Returns a message when the entry is invalid.
	 */
	checkEntry?: (target: PatchTarget, entry: unknown) => string | undefined;
}

export interface ApplyPatchesResult {
	/** Every patch, in apply order; disabled ones by cycle come first in registration order. */
	patches: PatchReport[];
	provenance: Provenance;
}

class PatchFailure extends Error {}

const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor']);

type Container = Record<string, unknown> | unknown[];
type Location = { container: Container; key: string | number; removeModule?: () => void };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	v !== null &&
	typeof v === 'object' &&
	!Array.isArray(v) &&
	(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** Copies plain objects and arrays; anything else (functions, class instances) is shared. */
function clonePlain<T>(value: T): T {
	if (Array.isArray(value)) return value.map(clonePlain) as T;
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
		return out as T;
	}
	return value;
}

function splitPath(path: string): string[] {
	const segments = path.split('.');
	if (path === '' || segments.some((s) => s === '')) {
		throw new PatchFailure(`invalid path "${path}"`);
	}
	const bad = segments.find((s) => FORBIDDEN_SEGMENTS.has(s));
	if (bad) throw new PatchFailure(`invalid path "${path}": segment "${bad}" is not allowed`);
	return segments;
}

function keyIn(container: Container, segment: string, path: string): string | number {
	if (!Array.isArray(container)) return segment;
	const index = Number(segment);
	if (!Number.isInteger(index) || index < 0 || String(index) !== segment) {
		throw new PatchFailure(`path "${path}": "${segment}" is not an array index`);
	}
	return index;
}

/**
 * Finds where `path` points in `root`. With `create`, missing parent objects are made; a missing
 * part module is always an error (adding one is `append` on `modules`).
 */
function locate(
	root: Record<string, unknown>,
	target: PatchTarget,
	path: string,
	create: boolean
): Location {
	let segments = splitPath(path);
	let current: Container = root;
	if (target === 'part' && segments[0] === 'modules' && segments.length > 1) {
		const modules = root.modules;
		if (!Array.isArray(modules)) throw new PatchFailure(`path "${path}": the part has no modules`);
		let found: { index: number; rest: string[] } | undefined;
		for (let n = segments.length - 1; n >= 1 && !found; n--) {
			const id = segments.slice(1, 1 + n).join('.');
			const index = modules.findIndex((m) => Array.isArray(m) && m[0] === id);
			if (index >= 0) found = { index, rest: segments.slice(1 + n) };
		}
		if (!found) {
			throw new PatchFailure(
				`path "${path}": the part has no such module (add one with "append" on "modules")`
			);
		}
		const tuple = modules[found.index] as unknown[];
		if (found.rest.length === 0) {
			const index = found.index;
			return { container: tuple, key: 1, removeModule: () => modules.splice(index, 1) };
		}
		if (tuple[1] === undefined && create) tuple[1] = {};
		if (!isPlainObject(tuple[1]))
			throw new PatchFailure(`path "${path}": the module config is not an object`);
		current = tuple[1];
		segments = found.rest;
	}
	for (let i = 0; i < segments.length - 1; i++) {
		const key = keyIn(current, segments[i]!, path);
		let next: unknown = (current as Record<string | number, unknown>)[key];
		if (next === undefined && create) {
			next = {};
			(current as Record<string | number, unknown>)[key] = next;
		}
		if (next === undefined) throw new PatchFailure(`path "${path}" does not exist`);
		if (!Array.isArray(next) && !isPlainObject(next)) {
			throw new PatchFailure(
				`path "${path}": "${segments.slice(0, i + 1).join('.')}" is not an object or array`
			);
		}
		current = next;
	}
	return { container: current, key: keyIn(current, segments[segments.length - 1]!, path) };
}

const read = (loc: Location): unknown =>
	(loc.container as Record<string | number, unknown>)[loc.key];
const write = (loc: Location, value: unknown): void => {
	(loc.container as Record<string | number, unknown>)[loc.key] = value;
};

/** Applies one op to `entry` (a mutable clone) and returns the field changes it made. */
function applyOp(
	entry: Record<string, unknown>,
	target: PatchTarget,
	op: PatchOp
): Array<Omit<PatchChange, 'entry'>> {
	switch (op.op) {
		case 'set': {
			const loc = locate(entry, target, op.path, true);
			const from = clonePlain(read(loc));
			write(loc, clonePlain(op.value));
			return [{ path: op.path, from, to: clonePlain(op.value) }];
		}
		case 'merge': {
			if (!isPlainObject(op.value))
				throw new PatchFailure(`merge at "${op.path}": the value is not an object`);
			const loc = locate(entry, target, op.path, true);
			const before = read(loc) ?? {};
			if (!isPlainObject(before))
				throw new PatchFailure(`merge at "${op.path}": the target is not an object`);
			const merged: Record<string, unknown> = { ...before };
			const changes: Array<Omit<PatchChange, 'entry'>> = [];
			for (const [k, v] of Object.entries(op.value)) {
				if (FORBIDDEN_SEGMENTS.has(k))
					throw new PatchFailure(`merge at "${op.path}": key "${k}" is not allowed`);
				changes.push({ path: `${op.path}.${k}`, from: clonePlain(before[k]), to: clonePlain(v) });
				merged[k] = clonePlain(v);
			}
			write(loc, merged);
			return changes;
		}
		case 'remove': {
			const loc = locate(entry, target, op.path, false);
			const from = clonePlain(read(loc));
			if (loc.removeModule) loc.removeModule();
			else if (Array.isArray(loc.container)) {
				if ((loc.key as number) >= loc.container.length)
					throw new PatchFailure(`path "${op.path}" does not exist`);
				loc.container.splice(loc.key as number, 1);
			} else {
				if (!Object.hasOwn(loc.container, loc.key))
					throw new PatchFailure(`path "${op.path}" does not exist`);
				delete loc.container[loc.key as string];
			}
			return [{ path: op.path, from, to: undefined }];
		}
		case 'append':
		case 'insert': {
			const loc = locate(entry, target, op.path, op.op === 'append');
			let array = read(loc);
			if (array === undefined && op.op === 'append') {
				array = [];
				write(loc, array);
			}
			if (!Array.isArray(array))
				throw new PatchFailure(`${op.op} at "${op.path}": the target is not an array`);
			const from = clonePlain(array);
			if (op.op === 'append') array.push(clonePlain(op.value));
			else {
				if (!Number.isInteger(op.index) || op.index < 0 || op.index > array.length) {
					throw new PatchFailure(
						`insert at "${op.path}": index ${op.index} is out of range 0..${array.length}`
					);
				}
				array.splice(op.index, 0, clonePlain(op.value));
			}
			return [{ path: op.path, from, to: clonePlain(array) }];
		}
	}
}

function selects(select: PatchSelect<unknown>, entry: Readonly<{ id: string }>): boolean {
	if ('id' in select) return entry.id === select.id;
	if ('ids' in select) return select.ids.includes(entry.id);
	if ('tag' in select) {
		const tags = (entry as { tags?: unknown }).tags;
		return Array.isArray(tags) && tags.includes(select.tag);
	}
	return select.where(entry) === true;
}

/**
 * Patch order (ADR 0170 points 6 and 7): `after`/`before` between plugins, then priority, boot
 * index and registration order. Patches in a cycle are returned in `cyclic` with the cycle's ids.
 */
export function orderPatches(patches: readonly PatchSource[]): {
	order: number[];
	cyclic: Map<number, string[]>;
} {
	const n = patches.length;
	const byPlugin = new Map<string, number[]>();
	patches.forEach((p, i) => {
		const list = byPlugin.get(p.by);
		if (list) list.push(i);
		else byPlugin.set(p.by, [i]);
	});
	const out: number[][] = Array.from({ length: n }, () => []);
	patches.forEach((p, i) => {
		for (const plugin of p.def.after ?? []) {
			if (plugin === p.by) continue;
			for (const j of byPlugin.get(plugin) ?? []) out[j]!.push(i);
		}
		for (const plugin of p.def.before ?? []) {
			if (plugin === p.by) continue;
			for (const j of byPlugin.get(plugin) ?? []) out[i]!.push(j);
		}
	});

	// Tarjan's strongly connected components: members of a component with more than one patch are in a cycle.
	const cyclic = new Map<number, string[]>();
	const index = new Array<number>(n).fill(-1);
	const low = new Array<number>(n).fill(0);
	const onStack = new Array<boolean>(n).fill(false);
	const stack: number[] = [];
	let counter = 0;
	const strongConnect = (v: number): void => {
		index[v] = low[v] = counter++;
		stack.push(v);
		onStack[v] = true;
		for (const w of out[v]!) {
			if (index[w] === -1) {
				strongConnect(w);
				low[v] = Math.min(low[v]!, low[w]!);
			} else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
		}
		if (low[v] === index[v]) {
			const component: number[] = [];
			let w: number;
			do {
				w = stack.pop()!;
				onStack[w] = false;
				component.push(w);
			} while (w !== v);
			if (component.length > 1) {
				component.sort((a, b) => a - b);
				const ids = component.map((c) => patches[c]!.def.id);
				for (const c of component) cyclic.set(c, ids);
			}
		}
	};
	for (let v = 0; v < n; v++) if (index[v] === -1) strongConnect(v);

	const inDegree = new Array<number>(n).fill(0);
	for (let v = 0; v < n; v++) {
		if (cyclic.has(v)) continue;
		for (const w of out[v]!) if (!cyclic.has(w)) inDegree[w]!++;
	}
	const before = (a: number, b: number): boolean => {
		const pa = patches[a]!;
		const pb = patches[b]!;
		const prA = pa.def.priority ?? 0;
		const prB = pb.def.priority ?? 0;
		if (prA !== prB) return prA < prB;
		if (pa.bootIndex !== pb.bootIndex) return pa.bootIndex < pb.bootIndex;
		return a < b;
	};
	const ready: number[] = [];
	for (let v = 0; v < n; v++) if (!cyclic.has(v) && inDegree[v] === 0) ready.push(v);
	const order: number[] = [];
	while (ready.length > 0) {
		let best = 0;
		for (let k = 1; k < ready.length; k++) if (before(ready[k]!, ready[best]!)) best = k;
		const v = ready.splice(best, 1)[0]!;
		order.push(v);
		for (const w of out[v]!) {
			if (cyclic.has(w)) continue;
			if (--inDegree[w]! === 0) ready.push(w);
		}
	}
	return { order, cyclic };
}

/** Orders and applies `patches` to the registries; never throws for a bad patch (it is disabled). */
export function applyPatches(input: ApplyPatchesInput): ApplyPatchesResult {
	const { patches, registries, checkEntry } = input;
	const provenance: Provenance = { part: {}, resource: {}, body: {}, building: {}, category: {} };
	const reports: PatchReport[] = [];
	const { order, cyclic } = orderPatches(patches);

	for (const [i, ids] of [...cyclic].sort((a, b) => a[0] - b[0])) {
		const p = patches[i]!;
		reports.push({
			id: p.def.id,
			by: p.by,
			target: p.def.target,
			applied: [],
			changes: [],
			disabled: `order constraints form a cycle among patches ${ids.map((id) => `"${id}"`).join(', ')}`
		});
	}

	for (const i of order) {
		const { def, by } = patches[i]!;
		const report: PatchReport = { id: def.id, by, target: def.target, applied: [], changes: [] };
		reports.push(report);
		const registry = registries[def.target] as Registry<{ id: string }>;
		const updated: Array<{
			id: string;
			owner: string;
			next: { id: string };
			changes: Array<Omit<PatchChange, 'entry'>>;
		}> = [];
		try {
			for (const { def: entry, by: owner } of registry.entries()) {
				let selected: boolean;
				try {
					selected = selects(def.select as PatchSelect<unknown>, entry);
				} catch (e) {
					throw new PatchFailure(
						`select failed on ${def.target} "${entry.id}": ${e instanceof Error ? e.message : String(e)}`
					);
				}
				if (!selected) continue;
				const next = clonePlain(entry) as Record<string, unknown> & { id: string };
				const changes: Array<Omit<PatchChange, 'entry'>> = [];
				for (const op of def.ops) {
					try {
						changes.push(...applyOp(next, def.target, op));
					} catch (e) {
						if (e instanceof PatchFailure)
							throw new PatchFailure(`${def.target} "${entry.id}": ${e.message}`);
						throw e;
					}
				}
				if (next.id !== entry.id)
					throw new PatchFailure(`${def.target} "${entry.id}": a patch cannot change the id`);
				const problem = registry.validate(next) ?? checkEntry?.(def.target, next);
				if (problem)
					throw new PatchFailure(`${def.target} "${entry.id}" would be invalid: ${problem}`);
				updated.push({ id: entry.id, owner, next, changes });
			}
		} catch (e) {
			if (!(e instanceof PatchFailure)) throw e;
			report.disabled = e.message;
			continue;
		}
		for (const { id, owner, next, changes } of updated) {
			replaceDefinition(registry, next);
			report.applied.push(id);
			const fields = (provenance[def.target][id] ??= {});
			for (const change of changes) {
				report.changes.push({ entry: id, ...change });
				const list = (fields[change.path] ??= [owner]);
				list.push(by);
			}
		}
	}
	return { patches: reports, provenance };
}
