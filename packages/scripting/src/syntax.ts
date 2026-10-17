/**
 * A syntax check that compiles a script and never runs it (plan 058). The same wrapper as the
 * runner's (`wrapScript`), so what is valid here is valid there, and the line is the player's.
 * QuickJS `compileOnly` parses to bytecode without evaluating: no code of the script executes, not
 * even its top-level statements.
 */
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { scriptErrorPosition, wrapScript } from './runner.ts';

export type SyntaxCheck =
	{ ok: true } | { ok: false; message: string; line?: number; column?: number };

/** Bytes the compiler may use; a script is at most 64 KB (`script-share`), this is generous. */
const CHECK_MEMORY_BYTES = 16 * 1024 * 1024;

export function checkScriptSyntax(QuickJS: QuickJSWASMModule, source: string): SyntaxCheck {
	const runtime = QuickJS.newRuntime();
	try {
		runtime.setMemoryLimit(CHECK_MEMORY_BYTES);
		runtime.setMaxStackSize(256 * 1024);
		const context = runtime.newContext();
		try {
			const result = context.evalCode(wrapScript(source), 'script.js', { compileOnly: true });
			if (!result.error) {
				result.value.dispose();
				return { ok: true };
			}
			const dumped = context.dump(result.error) as unknown;
			result.error.dispose();
			const record =
				typeof dumped === 'object' && dumped !== null ? (dumped as Record<string, unknown>) : {};
			const message = typeof record.message === 'string' ? record.message : String(dumped);
			const at = scriptErrorPosition(typeof record.stack === 'string' ? record.stack : undefined);
			// An error at the end of the input (a bracket never closed) points at the wrapper's closing
			// line, one past the script: put it on the script's last line.
			const lines = source.split('\n').length;
			return {
				ok: false,
				message,
				...(at ? { line: Math.min(at.line, lines), column: at.column } : {})
			};
		} finally {
			context.dispose();
		}
	} finally {
		runtime.dispose();
	}
}
