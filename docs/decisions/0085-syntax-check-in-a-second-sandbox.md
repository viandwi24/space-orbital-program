# 0085 — The syntax check before Run compiles in a second sandbox of the same kind

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/058-script-editor-follow-ups.md
**Builds on:** ADR 0038 (the script Worker lives in a sandboxed iframe with a no-network CSP), ADR 0066 (the editor's light check is not a parser; "compile in the sandbox" was the named way to get a real one).

## Context

The editor's own check (plan 036) guesses at brackets and strings. The only real parser is the script engine, QuickJS in the sandbox, and until now it spoke only at Run. The page cannot compile the script itself: `new Function` is blocked by the page's CSP (ADR 0066), and a JavaScript parser library is the weight ADR 0038 refused for the highlighter.

## Decision

1. **The engine compiles, nothing runs.** `checkScriptSyntax(module, source)` in `@orbital/scripting` wraps the script exactly as the runner does (`wrapScript`), evaluates it with QuickJS `compileOnly` (parse to bytecode, no evaluation, so not even top-level statements execute) in a throw-away runtime with a 16 MB memory limit, and returns `{ ok: true }` or the engine's message with the line and column of the player's source (the two wrapper lines removed, an error at the end of the input put on the last line). The runner's `errorLine` got the same clamp, so a Run and a check agree.
2. **A second sandbox, not the Run's.** The flight page creates another `ScriptSandbox` (`startScriptSandbox()`, the code of ADR 0038 unchanged: `sandbox="allow-scripts"` without `allow-same-origin`, the `srcdoc` document with its CSP, the blob Worker, the containment self-test) and a `ScriptChecker` (`script-checker.ts`) around it. The first check opens it; it is closed after 30 s without a check, when the script panel closes and when the page goes. A Run never shares it, so a Run's lifecycle (Stop removes its iframe) and its containment line ("Runs isolated") are not touched by checking.
3. **The checker talks to the Worker over the port, not through the sim Worker.** The port `open()` returns is used by the page directly with two new messages in the existing protocol (`check`, `checked`; shape-checked by `parseToScriptWorker` / `parseFromScriptWorker`, source capped at 200 000 characters, error text at 500). The port is never given to the sim Worker, so the answer of a check cannot become a command; the Worker's handling of `check` is separate from `start`/`tick` (no runner is created).
4. **The answer is advisory.** Debounced 500 ms in the editor; only the answer for the source that is still in the editor is shown; the problems list shows "Syntax error: ..." with a line button and the gutter marks the line; the light check's structural guesses (unpaired brackets, unfinished strings) are hidden while the engine has an answer. Run is never blocked: the engine's error at Run still decides. No answer (sandbox could not start, timeout, source too long) means only the light check, and after a failed start the page waits 10 s before trying again.

## Alternatives considered

- **Check in the Run's sandbox.** It exists only while a script runs; opening it per edit would tear it down under a running script or share its Worker with a script in flight.
- **A parser in the page** (acorn, esprima): 100 KB or more for one feature, and a second grammar that disagrees with the engine on what is valid.
- **Run the script's first tick as a dry run.** Executes the player's code with no vessel; rejected, the point is that nothing runs.

## Consequences

- One more iframe and Worker while the script panel is open and the player types, for up to 30 s after the last edit; the first check pays the sandbox start (about the cost of a Run's), later ones are compiles of a few milliseconds.
- The containment probe runs in the checker's sandbox too; its report is not shown (the panel's line stays about the Run's sandbox).
- Docs: `architecture/scripting.md` (arrangement), `guides/scripting.md` (editor section), research.
