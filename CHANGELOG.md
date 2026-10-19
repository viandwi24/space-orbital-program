# Changelog

## 1.0.0 — unreleased (DRAFT)

> **Draft, prepared for plan 232 (release QA) before it starts.** It is written from the goals of plans 200–236. Before release, each line is checked against its plan's journal. Lines marked _(pending)_ wait for plans 228 and 230, and for the owner's review of 234.

The first public release of Space Orbital Program: build rockets in a 3D hangar, fly them to orbit and beyond, run a career, and mod everything, all in your browser.

### Worlds and the Space Center

- Every in-world page shares one layout: the time bar top left, the menu bar top right and the status bar along the bottom, matching the v2 design. One simulation runs per world, and moving between pages never reloads it. (204, 233)
- The clock has clear states (running, warp, paused by you, by the place, or by a hidden tab), shown in the time bar. Your pause always wins, and Hardcore can lock it. Leaving an active flight asks first. (205)
- Time warp is never refused without a reason. Physics warp works in the air and under thrust. A request above the limit takes the highest allowed level, and the time bar says why. (206)
- The Space Center's build menu works like a city builder. A category bar opens cards with a picture of each building, its cost, size, build time and levels, and what it still lacks. (235)
- Found branch space centers on the home planet from a map of its terrain. Founding costs money and the HQ takes days to build. A branch builds its own pads and dishes, becomes a ground station with a comms building, and can launch vessels. (236)
- _(pending: 234)_ A large deep-space dish tracks your vessel and is the network's high-tier station.

### Building

- The Hangar works like KSP's VAB: carry, snap, surface attach, symmetry 1–8 and mirror, inherited children, rotation with WASDQE, Alt-copy and undo, around a roomier turntable. (217, 220)
- Parts come in 0.625, 1.25 and 2.5 m classes. Engines and decouplers grow shrouds, and adapters and nose cones join the sizes with no gaps. (207)
- Procedural fairings and interstages: shape them in 3D, jettison them in flight. (219)
- Click a part for the same inspector as in flight, with build-time settings applied to its symmetry group. There is also an action group editor, Δv and TWR for any body and situation, a power budget, and a pre-flight report. (218)

### Parts and physics

- Parachutes (top, radial, drogue) work like KSP since 1.2: arm on staging, deploy when safe, and the state is shown in words. (209)
- New parts:
  - solid boosters and launch clamps;
  - a vacuum upper-stage engine and the 2.5 m class;
  - thrust limiters and gimbal settings;
  - basic science parts. (210)
- RCS blocks and cold-gas thrusters, on R with translation keys. (211)
- Docking ports in three sizes: dock, transfer across, undock with the names restored. (222)
- Power as a KSP player expects: monopropellant, solid fuel and cold gas; batteries; sun-tracking solar panels that go dark in shadow; an RTG. Probes drain charge and lose control when it runs out. (208)
- The atmosphere has temperature with height. Drag rises through the transonic band. Re-entry heating is a world rule, with part temperature limits and heat bars. (212)
- Move resources between tanks at a visible rate, and lock any tank's flow. (213)

### Flying

- Pad fixes:
  - the situation reads "On the pad";
  - MET starts at liftoff;
  - the throttle starts at 50 %;
  - a vessel with no control source says "Uncontrolled". (200)
- The vessel panel has four tabs (Overview, Parts, Resources, Comms), and the part inspector can be pinned up to three times. (214)
- Every HUD region has bounded sizes at 1440, 1280 and 1024 px. Toasts stay off the navball, and side panels no longer move the camera. (215)
- Switch between vessels with `[` and `]`, from the map, or from the Mission Center; every vessel keeps its design. (221)
- Navigation:
  - typed Δv for every maneuver node;
  - AN/DN and the planned orbit's Ap and Pe;
  - warp to any marker, and alarms that stop warp;
  - the next transfer window. (224)
- EVA: walk, run, jump, fly a 270 N jetpack, climb ladders and board at the hatch. (225)
- Four camera modes on V; F2 hides the interface; a key saves a screenshot. (226)
- The Mission Center's fleet list: filter by type, recover a landed vessel anywhere, rename, terminate, and keep debris up to a cap. (223)

### Controls, sound and learning

- The KSP key profile is the default; "Orbital classic" keeps the earlier keys. (216)
- Procedural sounds for explosions, decoupling, chutes, touchdown, RCS, EVA and the jetpack, and quiet ambient music, each with a visual sign. (227)
- Four lessons after the first orbit: landing, maneuver nodes, rendezvous and docking, and a transfer. (229)
- _(pending: 228)_ Tooltips on every HUD term and a glossary.

### Career

- Every new part has a place in a larger tech tree. New contracts: rescue, satellite, station and docking. The science panel lets you pick which experiment to run and which result to send. (231)

### Saves, safety and tools

- _(pending: 230)_ World rules for revert and quickload; rules can change toward easier only. The game asks for persistent storage and prompts you to export saves.
- An error shows a friendly card with "Save and reload" instead of a dead page. (202)
- A debug panel (Alt+F12) with cheats, set orbit, location and resources, and a log; a world that uses cheats is marked. (203)
- High-preset shadows no longer flicker. (201)

### For modders

- Mod API 0.1.x additions:
  - building categories with `scope: 'buildings'` (0.1.84);
  - branch HQ buildings (`provides: ['branch-hq']`), the `found-branch` command and site placement at a spot (0.1.87);
  - and the additions listed in `docs/architecture/plugin-system.md` and `docs/guides/writing-a-mod.md` for each plan.
