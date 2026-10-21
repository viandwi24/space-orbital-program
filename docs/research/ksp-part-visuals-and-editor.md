# KSP part visuals, pod apex and editor placement (checked 2026-10-21)

Research behind ADRs 0255–0264. Full write-up: `refs/part-visuals-and-blueprints/`.

| Fact | Source | Checked |
|---|---|---|
| The Mk1 pod's small top node is meant for the Mk16 parachute. The Mk1-3 pod's 1.25 m top node takes the Mk16-XL, a docking port or an escape system: one part per node | [KSP wiki: Mk1 Pod](https://wiki.kerbalspaceprogram.com/wiki/Mk1_Pod), [Mk1-3 Pod](https://wiki.kerbalspaceprogram.com/wiki/Mk1-3_Pod) | 2026-10-21 |
| Editor rotate snap is 15° (5° with Shift). Offset snaps to a 0.2 grid (0.1 with Shift). `F` toggles local/absolute | [forum devnotes (0.90 editor)](https://forum.kerbalspaceprogram.com/topic/87376-editor-being-revised-for-090-what-would-you-like-to-see), [forum: editor gripes](https://forum.kerbalspaceprogram.com/topic/119579-things-i-hate-about-the-editor/page/4) | 2026-10-21 (community sources) |
| Stock offset is bounded; KSP 1.2 raised the bound with Shift; players use mods to remove it | [forum: offset without limit](https://forum.kerbalspaceprogram.com/topic/154448-how-to-offset-surface-attached-parts-without-limit) | 2026-10-21 (community source) |
| KSP1 diameters: 0.625, 1.25, 1.875 (MH), 2.5, 3.75, 5 m (MH). KSP2 shipped up to 5 m. 7.5 m was pre-release speculation only | `refs/reverse-engineering-ksp-ksp2/09-parts-catalogue.md`, [forum: part size categories](https://forum.kerbalspaceprogram.com/topic/205495-part-size-categories-please-add-more-large-parts) | 2026-10-21 |
| Breaking Ground deployed science and robotics part list (control station, Mini-NUK-PD, OX-Stat-PD, HG-48, Go-ob, PD-3, PD-22, Grand Slam; hinges, pistons, rotors, servos, KAL-1000) | [Steam newsletter, 24 May 2019](https://steamcommunity.com/games/220200/announcements/detail/1630779027896402729) | 2026-10-21 |
| tiermaker.com pages are behind a Cloudflare check; not read. The two imgur tier lists come from the same template | [imgur album](https://imgur.com/a/ksp-tierlist-t89NXPI), [imgur](https://imgur.com/XSHrpzp) | 2026-10-21 |
| Kerbal States "blueprints" are fictional craft on a blue grid, with stats and leader-line labels | [kerbalstates.com/tag/blueprints](https://kerbalstates.com/tag/blueprints/) | 2026-10-21 |
| Rapier multibody joints and motors: **not yet checked** against our Rapier build; plan 282's spike does it | — | — |
