/**
 * @orbital/scripting — sandboxed player scripts (ADR 0020).
 *
 * RULES (docs/architecture/boundaries.md): imports `core` and `quickjs-emscripten` only; no DOM,
 * no Bun/Node APIs, no `sim` import. The runner reads snapshots and returns commands.
 */
export { createScriptRunnerIn, scriptErrorLine, MAX_SCRIPT_WARP } from './runner.ts';
export { createScriptRunner } from './default-module.ts';
export type {
	BodyStateProvider,
	CommandVerdict,
	ScriptRunner,
	ScriptRunnerOptions,
	ScriptStatus,
	TickResult
} from './runner.ts';
export { buildTelemetry } from './telemetry.ts';
export type {
	ScriptEnvironment,
	Telemetry,
	TelemetryEngine,
	TelemetryNode,
	TelemetryPart,
	TelemetryTarget,
	TelemetryTargetChoice,
	TelemetryWheel
} from './telemetry.ts';
export { ascentScript } from './samples/ascent.ts';
