# 0252 — Vessel names are distinct: a number for a repeat, one "debris" suffix

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/270-map-pick-list-and-distinct-vessel-names.md
**Builds on:** ADR 0021 (debris lifecycle), ADR 0208 (fleet management: rename)

## Context

A launch takes its design's name, so a design flown twice gives two vessels with one name. A split names the new side `"<name> (debris)"`, and a piece of debris that splits again appends another suffix: the owner's map showed "Moon shot (debris) (debris) (debris)". The map card, the Mission Center rows and the target list cannot tell such vessels apart.

## Decision

1. **One pure rule in `@orbital/core`** (`vessel-names.ts`), so every host and the sim name alike. Names compare trimmed and case-insensitively.
   - `uniqueVesselName(wanted, taken)`: the name itself when free, else `"<name> 2"`, `"<name> 3"`, … the first free one. A name that already ends in a number gets another (`"Apollo 11 2"`): the rule never guesses that a number is a counter.
   - `vesselBaseName(name)`: the name without its debris tails (`" debris"`, `" debris 3"`, and the legacy `" (debris)"` chain), never empty.
   - `debrisName(source, taken)` = `uniqueVesselName("<base> debris", taken)`: "Moon shot debris", "Moon shot debris 2". The debris of debris is named after the first vessel, never "debris debris".
   - `splitName(source, taken)` = `uniqueVesselName(base, taken)`: a split-off side that has a control source (a probe or a crewed pod decoupled or undocked without a docking record) is a vessel, not debris: "Moon shot 2".
   - `tidyLegacyNames(names)`: a name with a `" (debris)"` tail becomes its `debrisName` against the others; every other name is kept.
2. **The sim applies it** at the launch (after `spawnVessel`, against every other vessel), at a split (`splitAt`, debris or split by the control-source test it already makes), to queued debris (a mod's `name` is made unique, the default is `debrisName`), and at an undock (the docked side gets its recorded name back, made unique against the vessels that exist now; the home side keeps the combined vessel's name).
3. **Old saves load with tidied names.** Only legacy `"(debris)"` names change, when the world is restored; the save format does not change. New saves never contain such a name, so a save and its reload stay equal.
4. **Rename stays free.** `rename-vessel` takes the player's name as typed (trimmed, 60 characters); two vessels may share a name if the player says so.

## Consequences

- A vessel the player named "Space debris" splits into "Space debris 2" (its base is "Space"): accepted, the rule is about readable defaults.
- Agencies' vessels, contract spawns and EVA kerbals keep their own names; they count as taken for the player's launches.
- The e2e that read "Two-stage (debris)" reads "Two-stage debris".
