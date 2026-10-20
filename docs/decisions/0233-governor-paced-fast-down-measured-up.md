# 0233 — The quality governor: a locked 60 or 30, fast down, up only on evidence

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/253-graphics-governor-retina.md
**Amends:** ADR 0053 (the governor's rules; its ladder, the 30 s preset dwell of plan 201 and the rAF-only measurement stay)
**Research:** `refs/graphics-performance/` 01 §4, 04 §8

## Context

The governor of plan 039 stepped down after 3 s over a 55 fps budget and stepped back up by timed trial: after 20 s of calm it tried one rung up, and every failed trial cost about 3 s of 30–40 ms frames before it stepped down again (the wait doubled up to 160 s, so a machine that cannot hold the top rung stutters for a few seconds every few minutes for ever). It aimed at 55 fps on every display, so it floated between 40 and 55 fps with the judder of alternating 16.7 and 33.3 ms frames, and a 120 Hz display was judged against 55 fps too. The browser gives no GPU time: a vsync-locked interval cannot show headroom.

## Decision

1. **A locked target.** The governor estimates the display's rate from the fastest intervals it sees (snapped to 30, 60, 90, 120 or 144 Hz) and targets **60 fps**; a display throttled to about 30 Hz (iOS Low Power Mode) targets 30 and is not fought. When even the lowest rung cannot hold 60 for 5 s it **locks to 30**. The page renders on a clock of its own: `tick(rafInterval)` says whether this rAF draws (a frame is drawn once 90 % of the target period has passed), so a 120 Hz display draws every second rAF at 60 and a 60 Hz display every second rAF at a lock of 30: even pacing, never 45.
2. **Fast down.** A frame is *over* when its interval exceeds the budget by 15 % (a missed vsync). Half the frames of the last second over drops one rung; a 95th percentile above twice the budget drops two (a sudden heavy scene is out of the way in about a second). The rung's own settle (2 s of unjudged frames after a change) and plan 201's 30 s preset dwell stay.
3. **Up only on evidence, never on a timer.** One rung up needs at least 30 s since the last change and 8 s of clean frames, and one of:
   - **measured headroom:** the page passes the frame's own work time (`frame(interval, workMs)`, for a GPU timer where one reads sanely) and the 95th percentile of it, scaled by the relative cost of the rung above (a coarse pixel model), stays under 80 % of the budget (60 % across a preset);
   - **a changed scene:** the page names the scene (`sceneKeyOf`: body, altitude band, map or flight) and it differs from the scene the rung above was left in. Each rung gets **one** trial per scene.
   A trial that falls over budget again within 6 s **bans that rung for that scene** until the scene changes. So a machine that cannot hold a rung is never retried while nothing changed, and a locked 30 counts as a new scene (the budget doubled).
4. **Debug says why.** Every change records its reason ("62 % of frames over 18.8 ms", "p95 41 ms: dropped two rungs", "scene changed, one trial up", "locked to 30 fps"); Debug → Info lists them with the target, the display rate and the pacing.
5. **Pixel-ratio rungs** (the first rungs lower the planet pass's pixel budget instead of the whole render scale) come with plan 252's budget and a `pixelRatio` for `governorLadder`; this ADR does not change the ladder's order.

## Consequences

- Plan 201's guarantee holds (at most one preset change in 30 s) and extends to rung changes upward; drops are not rate-limited beyond the settle.
- A machine that needs a rung down in a heavy scene stays there until the scene changes, then tries once. The cost is quality left on the table in a long steady scene; the gain is no repeating stutter.
- A GPU work time passed to `frame` is evidence only; without it the governor works on intervals alone.
