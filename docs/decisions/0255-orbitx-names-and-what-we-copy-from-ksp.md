# 0255 — Parts are OrbitX products; we copy KSP's kinds and shapes, never its names or art

**Status:** accepted (owner's decisions 2026-10-21, CTO call where the owner delegated)
**Date:** 2026-10-21
**Plan:** plans/291-part-detail-kit-livery-and-icons.md (first user); research `refs/part-visuals-and-blueprints/`

## Context

The owner wants our parts and blueprints to stand next to KSP and KSP2: the same kinds of part (a 4-way RCS block, a parachute on the pod's apex, a folding solar array, robotic hinges), drawn so they read as what they are, and well-known real rockets as blueprints. KSP's part names ("RV-105", "Mk16", "Communotron"), manufacturer names ("STEADLER", "Probodobodyne"), textures and models are Squad/Take-Two's. Real rocket names include trademarks ("Falcon", "Dragon", "Ariane"). On 2026-10-21 the owner chose one fictional company name, **OrbitX**, and fictional names for the real-rocket blueprints.

## Decision

1. **One fictional maker: OrbitX.** Every stock part title is `OrbitX <family code>-<size><variant> "<nickname>"` or a shorter form where the catalogue is cramped (for example `RCS-4 "Kompas"`, `PC-3 "Lonceng"`). The family codes and nicknames are listed in `refs/part-visuals-and-blueprints/parts-tracker.md`. Mods keep their own names.
2. **What we copy from KSP/KSP2:** the *kind* of part, its function, its interactions (stage, action group, panel toggle, animation) and its general shape where that shape follows from function (a parachute cone continuing the pod's slope, an accordion solar array). These are what real spacecraft look like and are not KSP's.
3. **What we never copy:** part names, manufacturer names, textures, decals, logos, model files. The KSP reference column in the tracker is research only and never ships.
4. **Real rockets become blueprints under fictional names** (Kronos V for Saturn V, Semyorka-S for Soyuz, Rajawali 9 for Falcon 9, …; table in the tracker §9). The blueprint text may say "inspired by" in words, without logos or trademarked marks.
5. **Our own look:** the palette of `product/visual-direction.md`, livery patterns and small details (keypads, panels, bolts) designed by us.

## Alternatives considered

- **Real rocket names.** Clearer to players; trademark risk for modern commercial names, so rejected by the owner.
- **Several fictional companies (one per field, as KSP does).** More flavour; the owner chose one brand.

## Consequences

- Stock part titles change in the plans that remodel each family; part ids (`stock.*`) do not change, so designs and saves are unaffected.
- The tracker is the single list of names to keep consistent.
