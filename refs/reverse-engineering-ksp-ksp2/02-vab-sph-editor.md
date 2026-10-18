# 02 — The vehicle editor as an interaction system (KSP1 VAB/SPH, KSP2 VAB)

**Why this document exists.** The owner's complaint about our Hangar is that it is "not interactive or flexible enough" and cannot reach KSP-level complexity, while in KSP attaching and tweaking parts is pleasant. Our earlier research (`refs/reverse-engineering-ksp2/03-vehicle-assembly.md`, `13-ui-ux-patterns.md`) covered *what* the editor contains: buildings, limits, Δv, workspaces, the PAW vs Parts Manager split. This document goes one level down, to *how it behaves under the hands*: what the mouse and keys do, what snaps to what, which modifier changes which step, and where players fought the tool. The goal is that an engineer can rebuild the feel without having played KSP.

**Method.** Public sources only: the official forum and patch notes, the KSP and KSP2 community wikis, the KSP API reference, mod READMEs, bug trackers and player threads. The official KSP wiki and forum block automated fetches (bot protection / HTTP 403) on the day of checking, so many facts come from search excerpts of those pages, and a third-party copy of the wiki key table [S1] was used to fill gaps. Where sources disagree, both versions are given. Tags: **[KSP1]**, **[KSP2]**, **[KSP2 — announced, never shipped]**, **[Mod: name]**. Numbers not confirmed by a source are marked *(unverified)*.

**What this document does not repeat.** Career part/mass limits per building level, KSP2 workspaces as "projects", the Δv formula, paint, and the PAW vs Parts Manager criticism are in the prior docs. They are referenced, not re-explained.

---

## 1. The interaction model in one paragraph

**[KSP1]** The editor is a *direct-manipulation* system with one dominant verb: **the part on the cursor**. Clicking a part in the list, or clicking a part already on the craft, picks it up; it (and every part attached below it) follows the mouse; candidate attach points light up as the cursor nears them; a second click drops it. There is no separate "move" command and no confirmation. Everything else is a modifier on that loop: keys rotate the carried part, `Alt` changes what it may stick to or duplicates it, `X` multiplies it around an axis, `C` changes rotation steps, and four numbered gizmo modes (`1`–`4`) handle what the carry loop cannot (fine offset, free rotation, re-rooting) [S1][S3]. This "pick up, hover, click" loop with immediate visual answers is the core of what players mean by pleasant. **[KSP2]** kept the loop and the numbered tools, but moved the camera bindings, added multi-assembly workspaces and procedural parts, and shipped with bugs in exactly the places the loop depends on (symmetry, snapping, re-anchoring, undo) [S9][S10][S13][S14][S16].

---

## 2. Camera

### 2.1 KSP1 VAB: a vertical turntable

- **Orbit.** Right mouse drag rotates the camera around a *vertical axis* through the craft; the pitch is limited, so the view never flips. The rocket stays upright on screen because rockets are built vertically. *(Behaviour widely described; exact pitch limits still unverified.)*
- **Height.** The camera moves up and down the rocket rather than zooming. Page Up / Page Down scroll the view vertically [S1]. Players remember the plain scroll wheel as "move up/down the height of the rocket" and a modifier+scroll as zoom [S12]. The key table gives **Shift + wheel = zoom** [S1]; one player recalls Ctrl+scroll. Treat "wheel = height, modifier + wheel = zoom" as the model and the modifier as uncertain.
- **Whole craft.** Shift + left drag moves the entire ship [S1] (it grabs the root, so the whole tree comes along).
- **Why it works.** The craft is tall and thin; a turntable plus a height slider covers 95% of views with one hand on the mouse, and the camera can never end up upside down or lost.

### 2.2 KSP1 SPH: a free hangar camera

- In the SPH the wheel zooms and the middle mouse drag pans the camera around the hangar; Shift + wheel behaves "opposite to the VAB" [S12]. The SPH is horizontal: planes are long, so panning along the fuselage matters more than height.
- **Symmetry default differs per building**: radial in the VAB, mirror in the SPH (see §4) [S8].
- Both buildings have a hard workspace bound; very large craft leave the room, which is why **[Mod: Hangar Extender]** existed [S35].

### 2.3 KSP2 VAB camera

- **Orbit:** right drag, with the cursor *not* over a part (otherwise the drag is a part action) [S12].
- **Zoom:** scroll wheel [S12].
- **Height:** middle-mouse drag "tracks the camera along the vehicle's long axis"; **focus:** middle-click a part to centre on it [S11][S12].
- **Orientation:** one VAB for everything, with a **workspace orientation button** (lower left) that switches between vertical (rockets) and horizontal (planes, rovers) construction; 0.1.4.0 fixed panning not following that toggle [S11][S14].
- **Complaints.** Players asked for the KSP1 scheme back: wheel = height, not zoom [S12]. There was no horizontal pan, which hurt plane building; accidental middle-clicks moved the focus; the camera snapped back to the anchor part [S12][S16]. Community mods restored the old feel: **[Mod: Zoomer]** ("KSP1-style zoom and pan") and **[Mod: WASD for VAB]** (WASD lateral, Q/E vertical while holding right mouse) [S18].

**Lesson for the feel:** the camera must never be the thing the player thinks about. KSP1's VAB camera is constrained (turntable + height) and people loved it; KSP2's freer camera with overloaded middle-click was the most cited regression.

---

## 3. Picking and placing parts

### 3.1 From catalogue to cursor

**[KSP1]** Click a part icon in the list: it appears under the cursor, already "carried". The first part placed in an empty editor becomes the **root** (it is placed in space, not on anything). Every later part must attach to the tree or be left floating. Hovering an icon shows a tooltip with stats; the extended tooltip has more detail *(still unverified on the exact delay)*. **[Mod: PartTips]** adds middle-click on a placed part to open its tooltip and Alt+middle-click to find it in the list, which shows the stock gap: you cannot go from a part on the craft back to its catalogue entry [S22].

### 3.2 Attach nodes (stack attach)

- **What a node is.** A part config declares nodes as position, direction and a size number. The classic line `node_stack_top = x, y, z, dx, dy, dz, size` has seven values [S19]. KSP2 part definitions keep the same idea with explicit fields: attach method (fixed joint for stack, hinge joint for surface), multi-joint (up to 3 joints), position, orientation, size, crossfeed and rigid flags [S20].
- **Sizes.** Stock diameters are 0.625 m, 1.25 m, 2.5 m and 3.75 m (plus 1.875 m and 5 m in Making History, e.g. S4 tanks, EP-50, T-50, TD-50 *(verified 2026-10-18: [S46])*, and 5 m in KSP2). The node size integer controls the size of the node marker and, in KSP1, the joint strength *(joint-strength scaling still unverified)*. Sources disagree on the mapping: the common convention is size 0 = 0.625 m, 1 = 1.25 m, 2 = 2.5 m, 3 = 3.75 m *(still unverified)*, while one modding guide maps 0.625 m to size 1 [S19]. KSP2 docking-port types are named `size0` (0.625 m), `size1` (1.25 m) [S20].
- **Snapping.** While carrying a part, free nodes on the craft and on the carried part are drawn as spheres; when a carried node gets within a screen-space radius of a compatible free node, the part *jumps* to the aligned position and the pair highlights. Moving away releases it. Clicking commits. *(Radius and colours: general player knowledge, still unverified.)* Nodes are directional: a top node accepts a part's bottom node. A node only accepts one part.
- **Attach rules.** Each part has five flags: `stack, srfAttach, allowStack, allowSrfAttach, allowCollision` [S19]. "Can this part stack", "can it stick to surfaces", "may others stack on me", "may others stick to me". These four booleans drive all the highlight logic.

### 3.3 Surface (radial) attach

- **[KSP1]** If the carried part allows surface attach and the target allows it, the part sticks to the *mesh surface* under the cursor, oriented along the surface normal, at any height and angle. Radial decouplers, fins, boosters on decouplers, lights, antennas all work this way.
- **The `Alt` / Mod key.** Holding Mod (Alt on Windows, Option on macOS, right Shift on Linux) **disables surface attach** so the part only snaps to nodes [S1]. This matters when the cursor is over a tank but you want the node at its end.
- **[Mod: Editor Extensions Redux]** adds `T` to toggle surface vs node attach for all parts and to force surface attach even when the config forbids it [S4].
- **Gotcha.** Surface-attached parts are children of the part they touch, so moving that part moves them; but re-rooting can produce surprising trees (see §5.4).

### 3.4 The carried subtree, floating parts, deletion, copying

- **Pick up = detach.** Clicking a placed part picks up that part *and all its children* [S38][S22]. The parent stays. Drop it on a valid node or surface to reattach.
- **Floating parts.** Dropping the carried subtree over empty space leaves it **floating** in the workspace, drawn but not part of the craft. Only the floating subtree's own root has working nodes until it is reattached, because the craft must remain a single tree [S21]. Floating parts are not launched. *(Whether they persist on save in KSP1 is still unverified; our ADR 0029 "loose assemblies" are the same idea.)*
- **Delete.** Drop the carried part on the **part list**; that is the delete gesture [S21]. KSP2 added a **trash can** target and fixed "deleting an assembly by dropping it in the trashcan sometimes fails" in 0.1.2.0 [S13]. KSP1 also has a **Delete** key for the selected part (since 0.08.5) *(verified 2026-10-18: [S47])*.
- **Copy.** **Alt + click** on a placed part gives you a copy *in your hand*, including everything attached below it, keeping its symmetry set [S1][S22]. KSP2 keeps Alt-copy (0.1.4.0 fixed "Alt-copying a subassembly with wings flips one wing") [S14].
- **Select whole craft.** Shift + click/drag picks the entire ship regardless of which part was clicked [S1][S22].

### 3.5 Root part

The root is the first part placed and the parent of the whole tree. It matters because (a) every pick-up detaches "the part and its children", and children are defined relative to the root; (b) the craft is controlled from the root by default; (c) in KSP1 autostrut can target it. **[KSP1]** The Re-root tool (`4`) makes any part the new root (0.90) [S3]. **[KSP2]** the equivalent is the **Part Anchor** tool, which sets an assembly's root; 0.1.4.0 had to make "current and potential anchor points visually distinct" [S11][S14], and players found re-anchoring in dense craft hard in both games [S16].

---

## 4. Symmetry

- **Counts. [KSP1]** Radial mode places 1, 2, 3, 4, 6 or 8 copies around the parent's axis [S7]. `X` cycles up, `Shift+X` down [S1]. The toolbar shows a symmetry icon you can also click [S22].
- **Mode.** `R` toggles **radial** (copies around the vertical axis of the parent) vs **mirror** (one copy reflected across the craft's centre plane) [S1]. VAB defaults to radial, SPH to mirror [S8]. During 0.90 development the toggle was briefly on `Y` [S38].
- **Inheritance.** In the VAB, a child placed on a part that is in radial symmetry is *forced* into the same symmetry: put a fin on one of four boosters and you get four fins. This is how a 4× booster with 4× fins and 4× nose cones is built in three clicks. It also surprises SPH builders, whose parts can flip to radial when the parent is radial [S8][S45].
- **Pivot.** In Place mode, `F` toggles whether symmetry is around the parent part or around the whole vessel [S1].
- **Persistence.** A symmetry set is stored with the craft; picking up any member picks up the set; deleting one deletes all; tweaks in the PAW apply to all counterparts (1.12.2 extended "Disable Staging" on decouplers to all counterparts) [S37]. To break a set in stock you must remove and re-place; **[Mod: Editor Extensions Redux]** adds Alt+Shift+click to strip symmetry from a part and custom counts beyond 8 [S4].
- **Staging.** Symmetry sets appear as one grouped icon in the stage stack (§7).
- **[KSP2]** Same radial and mirror modes, counts 2–8 [S9]. At launch KSP2 did *not* force children into the parent's symmetry; players had to set it by hand or build one branch and copy it [S9]. Nested symmetry sets were mishandled until 0.1.2.0; symmetry could get stuck at 1× after a long session (fixed by leaving the VAB) even in 0.2.0 [S9][S13]. Changing symmetry while placing a strut broke it until 0.1.3.0 [S14].

---

## 5. Angle snap and the four gizmos

### 5.1 Rotation while carrying

- `W/S` pitch, `A/D` roll ("flat"), `Q/E` yaw the carried part, in **90° steps**; holding **Shift gives 5° steps**; `Space` resets rotation [S1].
- Rotation keys work in the carry loop, before the part is attached, so the player orients then clicks. This is fast and keyboard-light.

### 5.2 Angle snap (`C`)

- `C` toggles angle snap [S1]. With snap on, surface-attached parts align to fixed angles around the parent and to the vertical; with snap off they follow the exact cursor point and normal.
- The 0.90 notes: holding **Shift** during placement or while a gizmo is up reduces the angle snap from **15° to 5°** and reduces the offset grid interval [S3]. A dev note quoted a 0.2 m grid (0.1 with Shift) during development *(still unverified for the shipped build)* [S3].
- **[Mod: Editor Extensions Redux]** makes the snap steps a list: 1°, 5°, 15°, 22.5°, 30°, 45°, 60°, 90°, cycled with `C`/`Shift+C`, reset with `Alt+C`; plus `V`/`H` to centre a part vertically/horizontally on its parent, and "master snapping" to copy another part's position for VTOL engines that cannot be placed in symmetry [S4].

### 5.3 The gizmos: `1` Place, `2` Offset, `3` Rotate, `4` Re-root

Added in 0.90 (Dec 2014) [S3]. A row of four buttons at the top left; number keys switch.

| Tool | What it does | Space toggle (`F`) | Snap | Limits |
|---|---|---|---|---|
| **1 Place** | The carry loop above | `F`: symmetry around parent vs vessel [S1] | `C` angle snap | — |
| **2 Offset** | Click a part: a three-arrow translate gizmo appears; drag an arrow to slide the part (and its symmetry counterparts, mirrored) along that axis **without detaching** [S3][S38] | `F`: absolute (world grid) vs local (relative to the attach point/parent) [S1][S3] | Grid snap when `C` is on; Shift = finer step [S3] | Capped distance from the original attach point; stock has no override [S5] |
| **3 Rotate** | Click a part: a three-ring rotate gizmo; drag a ring to rotate about that axis | `F`: absolute vs relative rotation [S1] | 15° steps, 5° with Shift, free with snap off [S3] | None |
| **4 Re-root** | Click a part to make it root [S3] | — | — | Only parts with a suitable node; dense craft hard to target [S16] |

**Offset in practice.** The offset cap is the most hated rule. Players asked how to move surface parts "beyond the normal offset limit in stock"; the answer is that it cannot be done, and the workaround is to rotate the part 180° so it clips inward, offset, then rotate back, gaining about one part length [S5]. Holding Shift does not raise the cap [S5]. 1.0.5 made the tool "snappy" so parts no longer land exactly where the player wants [S6]. **[Mod: Editor Extensions Redux]** removes the caps (`L` in older versions) [S4][S5]. There is **no numeric input** for offset or rotation in stock.

**Clipping.** Offset deliberately allows pushing a part into another; part collision in the editor is mostly ignored once attached. "Allow part clipping" is a cheat/debug setting in stock; EER exposes it on `Alt+Z` with a warning [S4]. Clipping is part of the culture (hidden batteries, engine clusters) and is how players beat the part count.

### 5.4 KSP2 equivalents

- The move/rotate tool has the same snap options: click the snap-mode button again for a local/global popup, Shift for finer increments, a **magnet** button to disable snapping [S10].
- Players still found it "clumsy, slow, and difficult": parts jumped instead of moving smoothly and got stuck [S16], and rotations "often fail to land exactly at zero", hence requests for KSP1's global grid [S10].
- Re-root became **Part Anchor**; the Launch Assembly tool chooses which assembly launches [S11].

---

## 6. Part catalogue, subassemblies, merge, saving

- **Categories. [KSP1]** The left panel shows function tabs (Pods, Fuel Tanks, Engines, Command & Control, Structural, Coupling, Payload, Aerodynamics, Ground, Thermal, Electrical, Communication, Science, Cargo, Utility, Robotics). 0.90 turned these into the **By Function** filter and added **By Resource**, **By Manufacturer**, **By Module** (functionality), **By Tech Level**, plus **custom categories** (with subcategories) that the player fills by dragging parts in, in the "advanced" mode; subassemblies can be sorted into custom categories too [S3]. Sorting by size, cost, mass and name [S3]. 1.12 gave every advanced filter an icon [S37]. Players asked to group parts "by the sizes they go with, not the size they are" [S12].
- **Search.** A text box over names and tags; ` (back quote) focuses it, since 1.1 *(verified 2026-10-18: [S47])*.
- **Subassemblies. [KSP1]** Introduced in 0.22, save/load added in 0.23; shared between VAB and SPH but not between saves [S23]. You drag a subtree onto the subassembly area to save it, then drag it back out like a part. A subassembly carries its own staging. Players share their favourites (for example a pre-built lander or launch escape) as a habit [S23].
- **Merge. [KSP1]** The Load dialog has a **Merge** button that brings another craft in as a floating subtree, which you then attach [S24] (it existed by 1.5.1; earlier date still unverified).
- **[KSP2] workspaces.** One file holds several assemblies; the Launch Assembly marker picks one; workspace name ≠ vehicle name (prior doc 03). Struts and fuel lines were dropped from duplicated subassemblies until 0.1.2.0; Parts Manager per subassembly arrived then [S13].
- **Saving and thumbnails. [KSP1]** A `.craft` text file per vessel, in a VAB or SPH folder, with an auto-generated thumbnail image taken from the editor camera *(thumbnail capture details still unverified)*. Sharing: **KerbalX** accepts dragged `.craft` files and detects which mods they need; an in-game mod uploads directly from the editor; downloaded craft go into the save's `Ships/VAB` or `Ships/SPH` folder [S36].

---

## 7. Tweakables in the editor (right-click Part Action Window)

Right-click a part in the editor to open its PAW (in-flight the same window has different fields). A slider moves; the effect shows immediately in mass, Δv and the 3D model where relevant. Many fields only appear with **Advanced Tweakables** enabled in settings [S25][S26][S27]. Symmetry counterparts receive the same change.

| Tweakable | KSP1 | KSP2 |
|---|---|---|
| Fuel per tank (slider per resource, 0–max) | Yes | Yes, but per-tank fuel needs the Resource Manager hand-off (prior doc 13) |
| Thrust limiter (0–100%) | Yes | Yes |
| Gimbal limit / lock | Yes *(gimbal limit slider version still unverified)* | Yes *(still unverified)* |
| Decoupler ejection force; enable/disable staging | Yes; staging toggle on counterparts fixed in 1.12.2 [S37] | Yes *(still unverified)* |
| Crossfeed toggle (decouplers, docking ports) | Yes *(version still unverified)* | Yes *(still unverified)* |
| Autostrut: Off / Root / Heaviest / Grandparent | Yes, all parts since 1.2, Advanced Tweakables; retargets live as heaviest part changes [S25] | Different: "enhanced joint" fixes and multi-joint wing roots instead (prior doc 03) |
| Rigid attachment | Yes; makes the joint stiffer but more brittle, breaks without warning [S25] | — |
| Parachute deploy altitude and min pressure; spread angle; "open when safe" (1.2+) | Yes [S26]; spread angle barely matters to performance [S26] | Yes *(still unverified)* |
| Landing gear: brakes %, friction, spring/damper (auto or manual, since 1.1.2; 1.6 raised the advanced spring/damper limit to 3) | Yes [S27] *(verified 2026-10-18: [S48])* | Partly *(still unverified)* |
| Control surface authority, deploy, deploy direction, which axes | Yes *(1.0+ still unverified)* | Integrated control surface toggle in procedural wing editor (prior doc 03) |
| Part variants (shape/colour) | Yes; variants are visual; a "Base" variant resets [S30] | Paint (base + accent) per part |
| Procedural fairings | 1.0+: build mode (below) | Fairing editor button + length slider; max length raised in 0.1.4.0 [S14] |
| Procedural wings | [Mod: B9 Procedural Wings] | Stock: wings, stabilisers, all-moving surfaces; wrench icon opens a shape editor |

**KSP1 fairing build mode.** Place the fairing base under the payload; the editor enters a fairing mode where the next section follows the mouse. Each click adds a section, which may go straight or taper in/out within a limit. A status label shows mass and cost and is **green** if the section is valid, **orange** if it cannot be made, **blue** if it will close around an object; "close fairing" appears when tapered enough [S28]. Interstage fairings need Advanced Tweakables plus an "interstage nodes" toggle on the base, and an engine counts as shielded only if the interstage encloses its top node [S29]. The PAW has "Edit fairing" to re-enter the mode *(label still unverified)*. This is the best stock example of a *procedural part edited by direct manipulation in the 3D view* rather than by sliders.

**KSP2 Parts Manager.** One docked list of every part with its controls; criticised for low density and for breaking the link with the clicked part (prior doc 13). Edit buttons for wings and fairings appear when hovering a procedural part; they lingered too long until 0.1.4.0 [S14].

---

## 8. Staging editor

- **[KSP1]** The right column lists stages with the first to fire at the bottom; stage numbers count down, so stage 0 fires last. Each part that does something when staged (engine, decoupler, parachute, launch clamp) shows an icon; symmetry sets show as one grouped icon you can expand. **Drag** icons between stages; hovering a stage shows **+** to insert an empty stage and **−** to remove an empty one; Ctrl-click selects several icons; Shift-click to deselect when splitting a symmetry group [S31].
- **Auto-staging** orders new parts by decoupler depth as you build (engines above a decoupler fire after it). Any manual drag keeps working; there is a "reset" via the staging toggle *(still unverified label)*.
- **Per-stage numbers (1.6+).** Each stage shows Δv, and the expanded readout gives TWR, Isp, burn time and mass; a Δv tab in the lower right chooses the body and situation: sea level, an altitude, or vacuum [S41]. Empty stages could break the computation in 1.6.0 (prior doc 03).
- **[KSP2]** Δv and TWR per stage in the stack with body/situation selector. Bugs: staging order changing on revert with multi-vessel workspaces, stage groups losing order when switching assemblies (both fixed 0.1.2.0) [S13]; difficulty moving stages in the extended stack (fixed 0.2.2.0) [S15]; Δv for asparagus drop tanks near zero [S42].

---

## 9. Action groups editor

- **[KSP1]** The second tab at the top left switches the editor into action-group mode [S32]. Left column: stock groups (Stage, Gear, Lights, RCS, SAS, Brakes, Abort) and Custom 01–10 (keys 1–0). Select a group, click a part on the craft (it highlights), and pick from that part's actions (for example "Toggle engine"); any number of parts can share a group [S32]. Career gating: basic groups at building level 2, custom groups at level 3 (prior doc 03).
- **[KSP2]** Custom action groups exist (players use toggle actions in Exploration Mode, with some toggles broken) [S32]; the KSP2 assignment UI is not documented in sources found *(still unverified)*.

---

## 10. Engineer's report, overlays, crew, limits

- **Overlays. [KSP1]** Bottom-left buttons toggle the **Centre of Mass** (yellow-black ball), **Centre of Lift** (blue ball with arrow) and **Centre of Thrust** (purple ball with arrow) markers *(colours and absence of default hotkeys still unverified)*. **[KSP2]** "Center of" tools show CoM, CoT and Centre of Pressure markers [S13][S14]. **[Mod: RCS Build Aid]** adds a dry-CoM and average-CoM marker and RCS/engine torque arrows scaled to angular acceleration, only in the editor [S35].
- **Engineer's Report. [KSP1]** A panel with a craft summary (parts, mass, size vs the launch site limits) and "design concerns": no control source, crew/no crew in a crewed pod, no power, parts that will be lost, parachutes, and so on. Players say the stock list misses some checks (no antenna) and many ignore it once experienced [S33]. **[Mod: Extensive Engineer Report]** adds checks and turns the launch button red on failure while still allowing launch [S33]. KSP2 kept the report and fixed false warnings (0.1.2.0) [S13].
- **Limits.** Part count from the editor level, mass and size from the launch site level (prior doc 03).
- **Crew.** A Crew tab in the editor lists seats per crewed part; drag kerbals from the roster into seats *(layout still unverified)*.

---

## 11. Undo, craft files, launch

- **Undo/redo:** Ctrl+Z / Ctrl+Y [S1]. KSP1 undo existed for a long time but had state bugs (a fairing setting reset on every undo, prior doc 13). **[KSP2]** 0.1.4.0: undo no longer deletes the held part, new workspaces reset history, compound parts no longer make double snapshots, undo/redo faster [S14].
- **Launch site. [KSP1]** A dropdown under the Launch button lists the sites (with Making History and "allow other launch sites", for example Woomerang, Dessert) [S34]. **[KSP2]** one VAB; launch pad vs runway chosen at launch (prior doc 03).
- **Launch.** The Launch button runs the checks, saves, and goes to the pad. Revert brings you back to the editor with the craft intact. This revert loop is the core iteration loop.

---

## 12. Keyboard and mouse bindings

| Action | KSP1 VAB | KSP1 SPH | KSP2 VAB |
|---|---|---|---|
| Orbit camera | Right drag (turntable) | Right drag | Right drag (off a part) [S12] |
| Camera height | Wheel, Page Up/Down [S1][S12] | Middle drag pan | Middle drag along long axis [S11] |
| Zoom | Shift+wheel [S1] (some recall Ctrl) | Wheel | Wheel [S12] |
| Focus part | — *(still unverified)* | — | Middle-click part [S11] |
| Pick up / drop | Left click | Left click | Left click |
| Pick whole craft | Shift + left drag [S1] | same | *(still unverified)* |
| Copy part + children | Alt + click [S1][S22] | same | Alt + click [S14] |
| Node-only (no surface attach) | Hold Mod (Alt/Option/right Shift) [S1] | same | *(still unverified)* |
| Delete | Drop on part list [S21] | same | Drop on trash can [S13] |
| Rotate carried part | W/S, A/D, Q/E, 90° steps [S1] | same | similar *(still unverified)* |
| Fine rotate | Hold Shift: 5° [S1] | same | Shift finer [S10] |
| Reset rotation | Space [S1] | same | *(still unverified)* |
| Angle snap on/off | C [S1] | same | Snap button; magnet = off [S10] |
| Symmetry count | X / Shift+X [S1] | same | Toolbar *(keys still unverified)* |
| Radial vs mirror | R [S1] | same | Toolbar [S9] |
| Place / Offset / Rotate / Re-root | 1 / 2 / 3 / 4 [S1][S3] | same | Tools + Part Anchor [S11] |
| Local vs absolute | F [S1][S3] | same | Snap-mode popup [S10] |
| Undo / redo | Ctrl+Z / Ctrl+Y [S1] | same | Ctrl+Z / Ctrl+Y [S14] |
| Show part name | Hover tooltip | same | Hold Alt over part [S14] |

---

## 13. Feature matrix (feature × KSP1 × KSP2)

| Feature | KSP1 | KSP2 |
|---|---|---|
| Part on cursor carry loop | Yes | Yes |
| Stack nodes with snap + highlight | Yes | Yes |
| Surface attach + node-only modifier | Yes | Yes |
| Floating parts in workspace | Yes | Yes (plus multiple assemblies) |
| Alt-copy subtree | Yes | Yes |
| Radial symmetry counts | 1,2,3,4,6,8 | 2–8 |
| Mirror symmetry | Yes (R) | Yes |
| Child inherits parent symmetry | Yes | No at launch [S9] |
| Offset gizmo | Yes, capped | Yes |
| Rotate gizmo | Yes | Yes |
| Local/absolute toggle | F | Snap popup |
| Numeric entry for offset/rotation | No (mods) | No |
| Re-root | Tool 4 | Part Anchor |
| Function / manufacturer / resource / module filters | Yes (0.90) | Function, fewer filters |
| Custom categories | Yes | No *(still unverified)* |
| Subassemblies | Yes (0.22/0.23) | Assemblies inside workspaces |
| Merge craft | Yes | Workspaces |
| Per-part PAW in editor | Yes | Yes + Parts Manager |
| Autostrut / rigid | Yes (1.2) | No (engine-side fixes) |
| Procedural fairings | Yes (1.0), click-to-build | Yes, slider |
| Procedural wings | Mod | Yes |
| Part variants / paint | Variants (1.4) | Paint (base + accent) |
| Staging drag + auto-stage | Yes | Yes |
| Per-stage Δv/TWR + situation | Yes (1.6) | Yes |
| Action group editor | Yes, gated by level | Yes |
| CoM / CoL / CoT | Yes | Yes (+CoP) |
| Engineer's Report | Yes | Yes |
| Launch site selection | Dropdown | At launch |
| Undo/redo | Yes | Yes (buggy early) |
| Part count / mass limits | Career | None |

---

## 14. Feel: what players praise and what they hate

**Praised.**
- *Speed.* Parts snap to predetermined connection points so a first rocket can be built in about half a minute [S39]. The build → launch → revert loop is minutes long.
- *Symmetry with inheritance.* Three clicks for a four-booster stack with fins and cones.
- *Node snapping as a "LEGO" feel.* Parts click together, highlight tells you before you commit, and wrong combinations simply do not snap. (The LEGO comparison is common in community talk; no review was found using the word.)
- *Tweak while looking.* Fuel sliders and thrust limiter change mass and Δv live.
- *Freedom with clipping.* Offset into other parts lets experts make compact craft.

**Hated.**
- *Offset caps* and snapping that will not land where wanted [S5][S6].
- *No numeric precision* (mods fill it) [S4].
- *Wobble* → autostrut and struts everywhere; rigid attachment breaks without warning [S25].
- *Re-rooting and selecting buried parts* in dense craft [S16].
- *Clipping* as both feature and mess: hidden parts, hard selection.
- *KSP2:* camera rebinding, missing horizontal pan [S12]; clumsy gizmo [S16]; symmetry bugs [S9]; staging order bugs [S13][S15]; editor framerate with many parts (part-bounds work fixed in 0.1.4.0) and CPU cost of Δv and fuel flow calculation [S14][S40]; the workspace-to-UI ratio made building feel cramped [S17]. One player summed it up as enjoying rocket design less than in KSP1 [S16].

**Mods that fix editor pain.**
- **[Mod: Editor Extensions Redux]** custom symmetry/snap steps, centring, strut alignment, offset caps removed, clipping toggle, attach toggle [S4].
- **[Mod: RCS Build Aid]** dry CoM, torque arrows [S35].
- **[Mod: Kerbal Engineer Redux]** per-stage Δv/TWR before 1.6 (prior doc 03).
- **[Mod: Procedural Parts]**, **[Mod: B9 Procedural Wings]**, **[Mod: TweakScale]**: resize parts and tanks continuously, cutting part count *(features from general knowledge, still unverified here)*.
- **[Mod: Hangar Extender]** bigger workspace [S35].
- **[Mod: PartTips]** tooltip from a placed part, locate in list [S22].
- **[Mod: Zoomer]**, **[Mod: WASD for VAB]** KSP1-style camera for KSP2 [S18].

---

## 15. Implications for Space Orbital Program

**Where we are today** (from our ADRs 0029, 0034, 0071, 0148): the Hangar arms a catalogue part, then the player clicks one of the computed attach targets (hover ghost, Tab/Enter to cycle); detached subtrees become loose assemblies on the floor; undo/redo of whole snapshots; radial symmetry ×1/2/3/4/6 stored as groups; part yaw and a limited tilt; auto-staging by decoupler depth; CoM/CoT markers; a pre-flight verdict. ADR 0148 deliberately left out Place/Move/Rotate/Re-root buttons because the editor has no modes behind them. The gap to KSP is less about missing data and more about **the hands**: there is no part on the cursor, no live snapping while moving, no offset, no free rotation, no tweak panel per part, and no Alt-copy.

### Adopt
1. **The part-on-cursor loop.** Picking a part from the catalogue or the craft puts it (with its subtree) under the cursor; nodes highlight as it nears them; it snaps; one click commits. Keep the existing Tab/Enter target cycling as the keyboard/accessibility path.
2. **Modifier grammar from KSP1:** Alt-click copies a subtree with its symmetry; Alt-hold = node-only; Shift-drag = whole craft; drop on the catalogue = delete; Space resets rotation; WASDQE rotate carried part 90°, Shift for 5°.
3. **Symmetry inheritance**: a child on a symmetric parent is placed on every counterpart. Add 8× and mirror mode (`R`) for planes.
4. **Angle snap `C`** with steps 15°/5° (Shift) and a visible step indicator.
5. **Offset and Rotate gizmos with local/absolute (`F`)**, applied to the whole symmetry set.
6. **Per-part inspector (our PAW)** in the editor, with live stats: fuel per resource, thrust limiter, decoupler staging toggle and force, chute deploy altitude/pressure; changes apply to counterparts.
7. **Staging editor gestures:** drag icons between stages, + / − on hover, grouped symmetry icons, per-stage Δv/TWR/burn time with body and situation selector (we already compute these).
8. **Subassemblies and merge** in the library (ADR 0041 exists; make the drag-out gesture match the part loop).

### Improve
1. **Offset without caps, but with numeric entry.** Typed x/y/z and angle fields in the gizmo header, plus a "reset to attach point" button. This removes KSP's two most-modded pains in one feature.
2. **Snap step list instead of one toggle** (EER: 1, 5, 15, 22.5, 30, 45, 90°), with centring helpers (V/H).
3. **Camera: KSP1 VAB turntable by default** (wheel = height, Shift/Ctrl+wheel = zoom, right drag orbit, middle-click focus with an explicit "return to craft" key) and an automatic switch to a free pan camera in plane orientation. Never let the camera snap away by itself.
4. **Re-root and selection in dense craft:** a part tree list (linked both ways with the 3D view) to select buried parts, and re-root by right-click → "make root".
5. **Procedural parts edited in the 3D view.** KSP1 fairings' click-to-add sections with green/orange/blue validity is the right model; apply it to tanks, wings and fairings with drag handles plus numeric fields.
6. **Engineer's Report linked to parts** (already: verdict + highlight); add missing-antenna and lost-parts checks.
7. **Undo that includes tweaks, staging and symmetry changes as single steps**, and never drops the carried part (KSP2's bug).

### Avoid
1. Rebinding the camera away from the turntable model (KSP2's top complaint).
2. Offset caps with no override, and hidden "advanced tweakables" switches; show advanced fields collapsed instead.
3. Joint wobble requiring autostrut micromanagement (we simulate a rigid body, ADR 0018 — keep it).
4. A Parts-Manager-only workflow detached from the clicked part.
5. Building without a staging preview: KSP2 staging bugs on revert show that staging must be part of the undoable editor state.

### Minimum KSP-grade editor feature set (ordered by impact, mouse + keyboard)

1. Part on cursor with live node snapping, highlight and ghost; click to commit; drop on catalogue to delete.
2. Pick up any placed part with its subtree; floating (loose) assemblies; Alt-click copy.
3. Surface attach anywhere on a side, with Alt for node-only.
4. Symmetry 1–8 radial + mirror, inherited by children, as one undo step.
5. Rotation keys (WASDQE, Shift fine, Space reset) and angle snap `C`.
6. Turntable camera with height, zoom, focus; plane-orientation pan camera.
7. Per-part inspector with fuel, thrust limiter, staging toggles and live stats.
8. Staging editor with drag, insert/remove, groups, per-stage Δv/TWR and situation.
9. Offset and rotate gizmos with local/absolute and numeric fields.
10. Re-root; part tree list.
11. Subassemblies, merge, save/load with thumbnail and share link.
12. Procedural tanks/fairings/wings with 3D handles.
13. Action group editor (select group → click parts → pick action).
14. Overlays: CoM (wet/dry), CoL, CoT, and the pre-flight report.

### Notes for touch
- Replace "part on cursor" with **drag from the catalogue**: the part follows the finger with a vertical offset so it is not hidden, snaps to nodes as it passes, commits on lift; a long press on a placed part picks up its subtree.
- Modifiers become a small **sticky chip bar** (Copy, Node-only, Fine, Snap step) instead of held keys.
- Camera: one-finger drag on empty space orbits; two-finger drag = height/pan; pinch = zoom; double-tap a part = focus.
- Gizmo handles need 44 px targets and numeric fields as the precise path.
- Symmetry and rotation in a bottom tool pill that is always visible.

---

## Sources

All checked 2026-10-18.

- [S1] DefKey, "Kerbal Space Program keyboard controls", https://defkey.com/kerbal-space-program-ksp-shortcuts — third-party copy of the KSP wiki key table (the wiki itself, https://wiki.kerbalspaceprogram.com/wiki/Keys, was blocked; its excerpts agree on R, X, C, F, WASDQE, Shift 5°). Fair; matches the wiki where both were seen.
- [S3] KSP 0.90 "Beta Than Ever" release notes, https://forum.kerbalspaceprogram.com/developerarticles.html/ksp-has-gone-beta-v0900-is-officially-released-r152 and https://wiki.kerbalspaceprogram.com/wiki/0.90 — official changelog, via search excerpts (fetch blocked). Reliable.
- [S4] Editor Extensions Redux README, https://github.com/linuxgurugamer/EditorExtensionsRedux/blob/master/README.md — mod documentation. Reliable for the mod; shows what stock lacks.
- [S5] KSP forum, "How to offset surface attached parts without limit", https://forum.kerbalspaceprogram.com/topic/154448-how-to-offset-surface-attached-parts-without-limit — players, via excerpt. Anecdotal but consistent.
- [S6] Steam discussion on the 1.0.5 offset tool, https://steamcommunity.com/app/220200/discussions/0/496881136906357004 — player report. Anecdotal.
- [S7] KSP wiki, Vehicle Assembly Building, https://wiki.kerbalspaceprogram.com/wiki/VAB — symmetry counts 1/2/3/4/6/8, via search excerpt. Reliable.
- [S8] KSP forum, "Question re: symmetry mode in VAB" and "SPH and problems with defaulting to radial", https://forum.kerbalspaceprogram.com/topic/113655-question-re-symmetry-mode-in-vab — players. Fair.
- [S9] KSP forum KSP2 threads, https://forum.kerbalspaceprogram.com/topic/215420-v011021572-symetry-in-vab-has-huge-problems and https://forum.kerbalspaceprogram.com/topic/221496-symmetry-mode-wont-do-more-than-1x-symmetry — bug reports 2023. Anecdotal, dated.
- [S10] KSP forum, "Please bring back the snap grid of KSP1", https://forum.kerbalspaceprogram.com/topic/212845-please-bring-back-the-snap-grid-of-ksp1 — player request + reply, Feb 2023. Fair.
- [S11] KSP forum, "Kerbal Space Program 2 Pre-Release Notes", https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes — official, via search excerpts. Reliable.
- [S12] KSP forum, "Please revert all VAB controls back to KSP1" (https://forum.kerbalspaceprogram.com/topic/212501-please-revert-all-vab-controls-back-to-ksp1), "A few suggestions regarding UI/UX in the VAB" (https://forum.kerbalspaceprogram.com/topic/218338-a-few-suggestions-regarding-uiux-in-the-vab-and-in-flight) and Steam KSP2 camera thread (https://steamcommunity.com/app/954850/discussions/0/3772364949847356130); KSP1 SPH camera from https://steamcommunity.com/app/220200/discussions/0/1621724915812090078 — players. Anecdotal; bindings conflict between posts.
- [S13] kerbal.wiki, 0.1.2.0, https://kerbal.wiki/0.1.2.0 — transcription of official notes. Reliable.
- [S14] kerbal.wiki, 0.1.4.0, https://kerbal.wiki/0.1.4.0 — transcription of official notes; "hold Alt over a part" fix from the 0.1.3.0 notes mirror https://ui.lemm.ee/post/263724. Reliable / moderate.
- [S15] kerbal.wiki, 0.2.2.0, https://kerbal.wiki/0.2.2.0 — official notes transcription. Reliable.
- [S16] KSP forum, "12 hour gameplay feedback and recommended priority list" (KSP2), https://forum.kerbalspaceprogram.com/topic/212713-12-hour-gameplay-feedback-and-recommended-priority-list — one player. Anecdotal.
- [S17] KSP forum, "KSP2 VAB UI feedback", https://forum.kerbalspaceprogram.com/topic/223308-ksp2-vab-ui-feedback — one player. Anecdotal.
- [S18] KSP forum, "Zoomer v0.2.0 KSP1-style zoom and pan", https://forum.kerbalspaceprogram.com/topic/224209-zoomer-v020-ksp1-style-zoom-and-pan, and "WASD for KSP", https://forum.kerbalspaceprogram.com/topic/223551-wasd-for-ksp/ — mod pages. Reliable for the mods.
- [S19] KSP forum, "Node definitions explained", https://forum.kerbalspaceprogram.com/topic/155189-reopen-ksp-node-definitions-explained, and Modders' Corner "Getting started modding KSP", https://forum.kerbalspaceprogram.com/developerarticles.html/modders-corner-getting-started-modding-ksp-r11 — modding guides via excerpts. Fair; size mapping conflicts.
- [S20] KSP2 modding wiki, "Configuring parts", https://modding.kerbal.wiki/Configuring_parts — community. Fair.
- [S21] KSP bug tracker #26893, https://bugs.kerbalspaceprogram.com/issues/26893 (delete by dropping on catalogue), and forum on detached part nodes, https://forum.kerbalspaceprogram.com/topic/108146-bug-where-ship-becomes-un-editable-in-vab — tracker + player. Fair.
- [S22] KSP forum, "Very basic question" (Alt-click duplicate, Shift-click whole craft), https://forum.kerbalspaceprogram.com/topic/64479-very-basic-question; Steam answer on Alt-copy with children and the symmetry wheel, https://steamcommunity.com/app/220200/discussions/0/1520386297678979661; PartTips mod, https://github.com/Halbann/PartTips — players and mod. Fair.
- [S23] KSP wiki, Subassembly, https://wiki.kerbalspaceprogram.com/wiki/Subassembly, plus 0.23 notes quoted at https://extreme.pcgameshardware.de/threads/sammelthread-kerbal-space-program-howto-update-08-10-14-grosses-update-mit-neuem-gebaeude-und-vielem-mehr.274255/ and https://forum.kerbalspaceprogram.com/topic/223302-sub-assemblies-share-those-you-use-frequently — wiki + forum. Reliable for dates.
- [S24] KSP bug tracker #20442 (merge craft in 1.5.1), https://bugs.kerbalspaceprogram.com/issues/20442 — tracker. Establishes existence, not first version.
- [S25] KSP forum, autostrut threads, https://forum.kerbalspaceprogram.com/topic/201292-what-is-this-autostrut-of-which-you-speak and https://forum.kerbalspaceprogram.com/topic/157716-rigid-attachements-and-autostrut — players. Fair.
- [S26] KSP wiki, Tweakable, https://wiki.kerbalspaceprogram.com/wiki/Tweakable; forum on spread angle, https://forum.kerbalspaceprogram.com/topic/156287-boring-maths-on-parachutes-in-12 — wiki + player test. Fair.
- [S27] KSP wiki, 1.1.2, https://wiki.kerbalspaceprogram.com/wiki/1.1.2, and forum on gear tweakables, https://forum.kerbalspaceprogram.com/topic/138691-how-to-make-landing-gear-less-bouncy — changelog + players. Fair.
- [S28] KSP forum, "Is there any tutorial on the new fairing parts?", https://forum.kerbalspaceprogram.com/topic/113591-is-there-any-tutorial-on-the-new-fairing-parts — players, 1.0 era. Fair.
- [S29] KSP forum, interstage fairings, https://forum.kerbalspaceprogram.com/topic/199467-ksp-console-interstage-fairing and https://forum.kerbalspaceprogram.com/topic/212604-a-quick-tip-how-you-can-make-an-interstage-fairing — players. Fair.
- [S30] KSP API reference, PartVariant, https://kerbalspaceprogram.com/ksp/api/class_part_variant.html — official API docs (1.12.4). Reliable.
- [S31] KSP forum staging threads, https://forum.kerbalspaceprogram.com/topic/72114-staging-grouping and https://forum.kerbalspaceprogram.com/topic/163178-simple-but-really-useful-change-to-staging-ui — players, older. Fair.
- [S32] KSP wiki, Action group, https://wiki.kerbalspaceprogram.com/wiki/Action_group; forum how-to, https://forum.kerbalspaceprogram.com/topic/86256-action-groups-how; KSP2 custom groups, https://forum.kerbalspaceprogram.com/topic/222402-custom-action-groups-using-toggle-not-working — wiki + players. Fair.
- [S33] KSP forum, Extensive Engineer Report, https://forum.kerbalspaceprogram.com/topic/154440-151-extensive-engineer-report-continued-ship-sections-continued, and "There is nothing concerning about this vessel", https://forum.kerbalspaceprogram.com/topic/108299-quotthere-is-nothing-concerning-about-this-vesselquot — mod + players. Fair.
- [S34] KSP wiki, Woomerang Launch Site, https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site — wiki. Reliable.
- [S35] RCS Build Aid, https://github.com/m4v/RCSBuildAid; mods-for-building thread mentioning Hangar Extender, https://forum.kerbalspaceprogram.com/topic/181262-whats-your-favorite-mods-for-building-stuff — mod + players. Reliable / anecdotal.
- [S36] KerbalX, About, https://kerbalx.com/about — the sharing site itself. Reliable.
- [S37] KSP 1.12 release thread, https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available, and wiki 1.12.2, https://wiki.kerbalspaceprogram.com/wiki/1.12.2 — official. Reliable.
- [S38] KSP forum, "Editor being revised for 0.90 — what would you like to see", https://forum.kerbalspaceprogram.com/topic/87376-editor-being-revised-for-090-what-would-you-like-to-see — dev notes quoted in thread. Fair (pre-release).
- [S39] Scientific Gamer, "In praise of Kerbal Space Program", https://scientificgamer.com/in-praise-of-kerbal-space-program — press. Opinion.
- [S40] Game Design Skills, "Why did Kerbal Space Program 2 fail", https://gamedesignskills.com/game-design/why-did-kerbal-space-program-2-fail — commentary. Opinion.
- [S41] Steam discussion on the stock Δv tab, https://steamcommunity.com/app/220200/discussions/0/3044984779771000675, plus "KSP 1.6 To Vee or not To Vee" official news (prior doc 03 [S3]) — players + official. Fair.
- [S42] KSP forum, "Asparagus staging help", https://forum.kerbalspaceprogram.com/topic/222457-asparagus-staging-help — players. Anecdotal.
- [S45] KSP forum, "SPH and problems with defaulting to radial symmetry mode", https://forum.kerbalspaceprogram.com/topic/98072-sph-and-problems-with-defaulting-to-radial-symmetry-mode — players. Fair.
- [S46] KSP Wiki, "Making History parts" (Internet Archive snapshot), https://web.archive.org/web/20240121094209/https://wiki.kerbalspaceprogram.com/wiki/Making_History_parts. High.
- [S47] KSP Wiki, "Key bindings" (archive), https://web.archive.org/web/20240105022508/https://wiki.kerbalspaceprogram.com/wiki/Key_Bindings. Full key table incl. the VAB/SPH section with "since" versions. High.
- [S48] KSP Wiki, "1.6" changelog (archive), https://web.archive.org/web/20240121092216/https://wiki.kerbalspaceprogram.com/wiki/1.6. High.

## Needs verification

Added 2026-10-18 by the verification pass (see `16-verification-log.md`).

- KSP2 editor bindings column (pick whole craft, node-only modifier, rotate, reset, symmetry keys) and custom categories: still unverified: the KSP2 keybind forum post is blocked and no archive was found.
- Editor camera pitch limits, tooltip delay, snap radius and colours, CoM/CoL/CoT marker colours: still unverified: no wiki page describes them.
- Node size to diameter mapping and joint-strength scaling: still unverified: needs the CFG documentation page or part configs.
- Fairing "Edit fairing" label, staging reset label, crew tab layout, thumbnail capture, merge-button date: still unverified: no source read this pass.
- KSP2 tweakable equivalents (gimbal, decoupler, crossfeed, parachute, gear): still unverified: no KSP2 Part Manager documentation.

*(S2, S43 and S44 are intentionally unused.)*
