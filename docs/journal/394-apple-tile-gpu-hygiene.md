# 394 — Apple tile-GPU hygiene

**Plan:** [plans/394-apple-tile-gpu-hygiene.md](../plans/394-apple-tile-gpu-hygiene.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0340](../decisions/0340-tile-gpu-hygiene-nothing-ships.md)

## What was done

Read three r186.1's WebGPU backend: discard and transient attachments for multisampled buffers are already there, and the final pass is already one output node. Added three switches (bloom source ¼, `rg11b10ufloat` scene colour, opaque canvas), measured them on the M5, and removed them again. Nothing ships.

## p95 per step (M5, Chrome, 1285 × 803 at DSF 2, governor off; load 3 to 6)

| Variant | high pad / 3 km / orbit | medium pad / 3 km / orbit |
|---|---|---|
| base (first) | 25.2 / 25.1 / 25.0 | 16.7 / 16.7 / 16.6 |
| bloom ¼ | 25.9 / 25.4 / 25.0 | 16.7 / 16.7 / 10.4 |
| `rg11b10ufloat` | 17.2 / 26.0 / **993** | 10.0 / 10.3 / **507** |
| opaque canvas | 41.6 / 25.0 / 25.0 | 25.1 / 18.3 / 25.2 |
| all three | 17.9 / 33.3 / **983** | 16.8 / 10.3 / **544** |
| base (last) | 43.1 / 46.1 / 32.6 | 16.6 / 16.6 / 10.3 |

The two bases differ by up to 2 times: the run is noise-bound (the load rose while it ran). The wave target p95 ≤ 8.4 ms is far off at `high` (25 ms) and at `medium` (10 to 17 ms) in this window. The `rg11b10ufloat` rows froze in orbit.

## Not done

- The Xcode Metal capture [manual] and a quiet rerun (load under 3).
- Unit tests for target formats and the transient flag (nothing shipped).
- `measure-sunrise.ts` with `STEP_TO`, `capture-graphics.ts`.
