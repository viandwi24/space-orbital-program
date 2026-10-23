# Player-journey audit

Checked 2026-10-23, on origin/main after plans 380–384 and the system audit's D1–D7.

**The owner's question:** in every kind of world, does the player get each feature through a flow that makes sense? The audit looks for three problems:
- things that appear with no explanation;
- features the player can never reach;
- systems that exist but serve no purpose.

This is analysis only; no code was changed. Each finding was verified in code, and the worst ones in a headless sim:
- the Career start with an empty roster;
- the supply shortage on launch;
- the reputation dead board;
- company debt.

Sibling report: `system-audit-2026-10.md` (bugs).

## The modes

| | Sandbox | Science | Career | Career (hardcore) | Career (engineering) |
|---|---|---|---|---|---|
| Economy (money) | off | off | on | on | on |
| Tech tree | off (all parts) | on | on | on | on |
| Contracts, strategies | – | – | on | on | on |
| Crew death | off | off | permanent | permanent | permanent |
| Life support | off | simple | simple | full | simple |
| Control without signal | full | none | none | none | none |
| Reliability | off | off | off | off | **on** |
| Range safety | off | off | cost | cost | cost |
| Rival agencies | 0 | 3 | 3 | 3 | 3 |

Sources: `mods/stock/src/rules.ts`.

Other starts:
- **The Legacy world:** Sandbox at 0°, 0°.
- **Lesson worlds:** throwaway Sandbox worlds, stock system.
- **Scenarios:** stock ships none; the only one is in `examples/mod-sample`, and the menu hides an empty list.
- **Sol worlds:** the same as stock, with the site on the Earth.

## The start, in every mode

At minute 0, every world has the same Space Center:
- **Buildings:** the **pad (S), Hangar, Mission Center and Administration**, plus roads (`packages/core/src/buildings.ts:411`).
- **Not built:** R&D, the Astronaut Complex, the Test Stand and the tracking dish.
- **Crew:** **0** in every mode (`packages/sim/src/crew.ts:37`).
- **Funds:** 100 000. In Sandbox and Science the number is in the ledger but unused.
- **Tech:** in Science and Career, only the free Basics node: crewed pod, tanks, LV engine, decoupler, small SRB, chute, cones, fin, heat shield, clamp. **No probe core and no instrument.**
- **The site:** "Default (0°, 0°)" or one of five templates, resolved from the seed. There is no free pick on the planet; only Found a branch has one.

### Flow per mode, from Create World to the late game

**Sandbox, the Legacy world and lessons:**
1. Create World, then the Space Center.
2. The tour is offered: build and place a tracking dish, wait, visit, upgrade, demolish.
3. The Hangar, where the first-flight guide starts once a part is placed.
4. Launch, with a pilot hired for free at launch.
5. Flight.

Buildings are free and instant. There is nothing to earn: no money, no science, no contracts. The Administration and R&D pages are empty notes.

**Science:**
1. The same start as Sandbox, but only Basics parts.
2. The first science: an **EVA surface sample** (30 points) is the only science the starter parts can make. No lesson or guide says so.
3. Researching needs the R&D page. Its only door is the R&D building, which is not built; it is free here, but nothing says to build it.
4. Tier 2 needs an orbit, tiers 3–5 the Moon.

**Career, hardcore and engineering:**
1. Create World, then the Space Center and the tour (in Career the dish costs 20 000 and is refunded when demolished).
2. The Hangar: the guide builds a pod rocket.
3. Launch: **"No crew available: hire in the Astronaut Complex"**, a building that does not exist.
4. Launched anyway, the pod is uncontrolled ("has no crew in its command part").
5. The real path is undiscovered:
   - build the Astronaut Complex (30 000, 6 days);
   - open it, hire a pilot (8 000);
   - launch.
6. In orbit, the crew are **short of supplies from the first second** and are **lost after about 18 hours**: the grace is 3 home days of 6 h. The supply parts are in tier 4.
7. **Money:**
   - the grant (government +24 000, hybrid +12 000, company 0 every 30 days);
   - contracts (from day 1, reputation ≥ 0);
   - recovery;
   - missions pay reputation only.
8. **Science** as in Science mode, plus R&D at 50 000.
9. **Engineering:** parts fail, but **no UI sends the `repair` command**. The Test Stand (30 000) is not built and not mentioned.

## Feature reachability

How each feature is first reached. Mode columns: SB = Sandbox, Sci = Science, Car = Career and its variants.

| Feature | SB | Sci | Car | How it is reached; notes |
|---|---|---|---|---|
| Space Center site | template or 0°, 0° | same | same | Create World. No free pick. The globe pin draws far-side sites on the front. |
| Buildings | free, instant | free, instant | funds, days | The Space Center's Build. Taught by the tour. |
| Roads | automatic | automatic | automatic | Added by every placement. A home-only placement rule. Never explained. |
| Pad and launch | ✓ | ✓ | ✓ | Hangar → Launch. Pad mass and Hangar part limits are checked in the UI only, not in the sim. |
| Crew hiring | automatic pilot | automatic pilot | **unexplained**: Astronaut Complex only | No link from the Hangar or Launch. |
| Crew stats (morale, fatigue, dose, salary, return) | – | – | Flight crew card only | Not on the roster. Dose has no effect. There is no training, though the building says "trains". |
| Life support | – | simple | **unreachable early** | Supply parts in tier 4. The pod carries none. No Hangar check. |
| Science | – | EVA sample (untaught) | same | Instruments in tier 1 (10 science). |
| Tech tree | off | **unexplained**: R&D building only | same, 50 000 | The Hangar's "Research … in R&D" has no link. |
| Contracts | – | – | ✓ Administration | The rule shows "on" in Sandbox and Science, where it can't run. |
| Missions (main line) | offered in Flight | same | same | Never started for the player; the panel is in Flight only. |
| Strategies | – | – | ✓ Administration | |
| Market | – | – | read-only panel | No UI sends `market-buy` or `market-sell`. Selling happens only at recovery (D2). |
| Production (propellant plant) | inert | inert | ✓ (80 000) | Its fuel serves launches from that site. |
| Comms | home station free | same | same | Tracking and deep-space dishes. A probe out of signal is never told why. |
| Probe cores | ✓ | after orbit | after orbit | The satellite bus has no antenna. |
| Recovery | ✓ | ✓ | ✓ | Flight, vessel menu, Mission Center. Explained by two lesson lines only. |
| Branch | free | free | 250 000 | Found a branch (all modes). Little reason to found one. |
| Base on another body | **unreachable** | **unreachable** | **unreachable** | No UI sends `deploy-base`. The base kit is in tier 5. |
| Outposts, routes | **unreachable** | same | same | No UI sends `join-site` or `create-route`. Flows shows them read-only. |
| Reliability and repair | – | – | engineering: **repair unreachable** | No sender for `repair`. The Test Stand is not built. No lesson. |
| R&D, Astronauts, Test Stand pages | building | building | building | Only through the building's "Open …", which also shows while it is under construction. |
| Space Center tour | ✓ | ✓ | ✓ | Its text says "Sandbox" for Science. It sends you to an Astronaut Complex that isn't there. |
| First-flight guide | ✓ | ✓ | ✓ | Progress is per browser, not per world. It shows beside the tour in the Hangar. |
| Lessons | Sandbox | – | – | **The Space Center lesson can't be finished**: its R&D and Astronauts steps need buildings its site lacks. |

## Findings

| # | Severity | Mode | Symptom | Recommendation | Status |
|---|---|---|---|---|---|
| J1 | **critical** | Career | The first crewed rocket can't be flown. The roster is empty, the Astronaut Complex isn't built, the Launch screen points to that missing building, and probes are locked. The pod launches uncontrolled. Reproduced. | Start Career with an Astronaut Complex and 2–3 crew (as KSP does). Link the Hangar's crew seats and the warning to the Astronauts page. | Fixed `65c89186` (Q1, ADR 0322): the Astronaut Complex and a crew of three at the start. |
| J2 | **critical** | Career | A crew in orbit is short of supplies from launch and is lost after about 18 h. The pod carries no supplies, and supply parts are in tier 4. Reproduced. | Give command pods built-in supplies for a few days (KSP-like), or put a ration part in Basics. Add a Hangar supplies line. | Fixed `5ae74a3c` (Q2, ADR 0323): pods carry 4 crew-days a seat of massless rations. |
| J3 | high | Science, Career | The tech tree is on, but R&D isn't built and is its only door. The "Research in R&D" hint has no link. | Start with R&D when the tree is on (free in Science, part of the start in Career). | Fixed `65c89186` (Q1): R&D at the start in every world. |
| J4 | high | Career (company) | No income floor. A company loses 5 200 every 30 days with no crew and 17 200 with one pilot. Debt has no way out: launches are refused, and hiring still works in debt. Reproduced. | A company seed income or a guaranteed tier-1 offer, a loan or bankruptcy rule, and no hiring or construction past zero funds. Add a company career-bot test. | Fixed `69b68c11` (Q3, ADR 0324): service contracts, a loan, no hiring past zero. |
| J5 | high | Career | One cancelled or failed contract at reputation 0 leaves reputation below 0, and the board stays empty for hundreds of days (decay never reaches 0). The text says "a new one can come each day". Reproduced. | Tier 1 open to any reputation (or above −X), decay that reaches 0, and an empty-board text that names the reason. | Open |
| J6 | high | Career (engineering) | Parts fail, but no UI can repair them. The Test Stand isn't built or mentioned. | A "Repair" action for an engineer on EVA; the Test Stand in that preset's start. | Fixed `65c89186` (the Test Stand at the start) and `57d9774c` (a Repair button for an engineer on EVA). A reliability lesson is still to come. |
| J7 | high | all | Bases on other bodies, outposts and cargo routes have no player entry point. The base kit and drill can be bought and do nothing. The off-world buildings show in the build menu as "Only at an off-world base". | Either build the flows (deploy the kit from Flight, join site, a route editor in Flows), or hide the kit, drill and off-world buildings until they exist. | Open |
| J8 | high | Science, Career | The first science is an untaught EVA surface sample: no instrument is in Basics. The pacing test checks an ascent with instruments the player can't have. | Put the thermometer in Basics (or give the pod a crew report). Fix the pacing test. | Open |
| J9 | high | lessons | The Space Center lesson can't be finished: its R&D and Astronauts steps wait for buildings its site lacks. | Fixed by J1 and J3, or by a setup that places both. | Fixed `65c89186`: the lesson world has R&D and the Astronaut Complex. |
| J10 | medium | all | The main mission line never starts by itself. "First launch" says the guide shows each step, but the mission is only offered in Flight, once you are flying. | Start the first mission at world creation, or offer it in the Space Center and Hangar. | Open |
| J11 | medium | all | Three onboarding systems with no clear order: the tour, the first-flight guide (per browser) and Lessons (a separate world). Tour and guide cards both show in the Hangar. Nothing explains the chosen mode. | One hand-off: the tour ends with "first flight here, or a lesson?". A short welcome per mode. Guide progress per world. | Open |
| J12 | medium | all | A branch has little purpose. The HQ at the equator reaches every contract orbit. Capacity buildings at a branch do nothing (capacities are read at the HQ only). | Contracts only a branch serves well (polar or sun-synchronous satellites, range fans). Restrict HQ-only buildings to the HQ, or sum capacities. | Open |
| J13 | medium | Career | Money is never explained. There's no ledger, and the grant, operations and salaries aren't shown. Salaries are steep: one pilot is half a government grant. The agency-type rule has no description saying a company has no budget. | A Finances view: the ledger and a 30-day breakdown. Salary on hire. Rebalance salaries. Describe the agency types in Create World. | Partly fixed `69b68c11`: the Finances tab explains the money; salaries are paid only on missions (ADR 0322). |
| J14 | medium | all | Signal loss is never explained. A probe out of signal ignores input with no reason shown; the satellite bus has no antenna. | Show which controls are locked and why; warn in the Hangar when a probe has no antenna. | Open |
| J15 | medium | all | Levels and buildings that do nothing: runway levels 2–3 (length never read), Test Stand levels 2–3, Branch HQ levels 2–3, the R&D lab outside "discovery" science, tracking dish level 1 at the HQ (the HQ is already tier 1). | Give each level an effect, or remove it. | Open |
| J16 | medium | Career | Limits are lifted by removal: no building means no limit, so demolishing the Mission Center or Hangar removes the contract and part caps and saves upkeep. Pad mass and part limits are UI-only. | Missing building = the base limit, not none. Sim-side launch checks in Career. | Open |
| J17 | medium | all | The crew roster hides morale, fatigue, dose, salary and return time. Dose has no effect, and there is no training. In Science the card counts down "to live" though nobody can die. | Show them on the Astronauts page. Give dose an effect or drop it. Wording that follows the death rule. Drop "trains" from the building. | Open |
| J18 | low | Sandbox, Science | Pages for systems that are off: Administration shows funds and reputation; R&D in Sandbox draws the whole tree under its "no tree" note, which names Career only. The contracts rule shows "on". The Test Stand can be built without reliability. | Hide or gate them by rule. | Open |
| J19 | low | all | Create World's site choice: no free pick; the default shows no consequences; the globe pin draws far-side sites on the front; Sol uses procedural terrain. | Reuse the branch picker's map at creation; a note on Sol. | Open |
| J20 | low | Career (government) | Idles rich: about 341 000 by day 400 doing nothing. | Balance pass (grant vs upkeep), later. | Open |
| J21 | low | all | "Open …" works on a building under construction. | Gate on active. | Open |

## Checked and fine

- **Comms at minute 0:** the HQ is a free tier-1 ground station, so a probe has signal on the pad. Crewed vessels never need signal.
- **Recovery:** reachable from Flight, the vessel menu, the map card, the pad-occupied prompt and the Mission Center (also in bulk).
- **The Mission Center:** at start, plus Flight's map switch.
- **Overlaps:** the tour and lessons never overlap; the tutorial and lessons never overlap.
- **Government Career:** no softlock; the grant always restores funds.
- **Tech milestones:** `home`/`moon` resolve in stock and Sol.

## Design questions

**Q1. What a Career player starts with (J1, J3, J6, J9).**
- (a) Like KSP: the HQ starts with every core building at level 1 (Astronaut Complex, R&D, plus the Test Stand in engineering) and 2–3 crew (pilot, engineer, scientist). Money goes to upgrades.
- (b) Only the Astronaut Complex and 2 crew; R&D is built by the player, with a tour step pointing at it.
- (c) Keep the bare start, and add a tour step "build the Astronaut Complex and hire".
- **Recommendation:** (a). It removes four findings at once, and it's what players of the genre expect.

**Q2. Supplies on the first flights (J2).**
- (a) Command pods carry a few days of supplies (KSP-like).
- (b) A ration part in Basics.
- (c) Life support off in Career, on in hardcore only.
- **Recommendation:** (a). The pod alone is safe for short flights; long missions still need packs.

**Q3. A company's way out of debt (J4).**
- (a) A seed income for a company: a small fixed contract stream.
- (b) A loan or bankruptcy rule: borrow up to X at interest, or sell buildings.
- (c) Both, and refuse hiring or construction past zero funds.
- **Recommendation:** (c).

**Q4. Reputation (J5).**
- (a) Tier 1 at any reputation.
- (b) Tier 1 at reputation > −20, with decay that reaches 0.
- **Recommendation:** (b), with the empty board saying why.

**Q5. Off-world bases, outposts and routes (J7).**
- (a) Build their flows now: "Deploy base" on a landed kit in Flight, "Join site", a route editor in Flows, and refuelling a landed vessel from site storage so ISRU has a use.
- (b) Hide the kit, drill and off-world buildings until (a) exists.
- **Recommendation:** (b) now and (a) as a plan. Right now the player can buy parts that do nothing.

**Q6. First science (J8).**
- (a) The thermometer in Basics.
- (b) A "crew report" on every crewed pod.
- **Recommendation:** (a). It's a one-line change that matches the science lesson and the pacing test.

**Q7. Branches (J12).**
- (a) Give them a job: polar and sun-synchronous contracts that pay more from a high latitude, and range fans that a branch avoids.
- (b) Restrict HQ-only buildings to the HQ.
- (c) Both.
- **Recommendation:** (c).

**Q8. Onboarding order (J10, J11).**
- (a) One hand-off: tour → "first flight here (guide) or a lesson?" → the first mission started; a welcome per mode.
- (b) Keep three systems, but the guide follows the world.
- **Recommendation:** (a).
