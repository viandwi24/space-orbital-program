import { getQuickJS } from 'quickjs-emscripten';
import { createScriptRunnerIn, type ScriptRunner, type ScriptRunnerOptions } from './runner.ts';

/**
 * Build a runner in the shared `getQuickJS()` module (Bun, Node, tests). Kept apart from
 * `createScriptRunnerIn` so a bundled host that supplies its own module never pulls in
 * `quickjs-emscripten`'s default loader and its WASM variants.
 */
export async function createScriptRunner(
	source: string,
	options: ScriptRunnerOptions
): Promise<ScriptRunner> {
	return createScriptRunnerIn(await getQuickJS(), source, options);
}
