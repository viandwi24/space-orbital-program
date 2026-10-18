# 115 — Comms tier 1 in the interface

**Plan:** [plans/115-comms-tier-1-interface.md](../plans/115-comms-tier-1-interface.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0158](../decisions/0158-comms-interface-link-badge-comms-tab-network-overlay.md) (new), [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md), [0153](../decisions/0153-vessel-panel-controls-from-descriptors-group-clicks-and-part-highlight.md), [0118](../decisions/0118-mission-center-system-scope-own-sim-and-fly.md), [0079](../decisions/0079-plasma-blackout-is-a-display-of-the-heating-flux.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `lib/comms/network-model.ts` | the reason in words (`linkText`), the badge (`linkBadge`), the Comms tab (`commsTab`), the Network layer in the system frame (`networkLines`, `networkStations`) and on screen (`projectNetwork`) |
| `lib/hud/LinkBadge.svelte` | bars and "Linked to …", or the reason; the blackout scan lines kept; the blackout badge stays for worlds without a network |
| `lib/vessel-panel` | the Comms tab: Auto route, the hop path, the reason, the ground stations, the transmitters (antenna toggles from descriptors); visible labels beside every switch (the Overview and Parts switches of plan 111 had only an `aria-label`) |
| `lib/comms/NetworkLayer.svelte` | link lines by state and station markers, in the flight map (`FrameData.network`) and the Mission Center (replacing its plain link lines) |
| `scripts/capture-comms.ts` | the screenshots below |
| tests | `comms/network-model.test.ts` (3), `comms/comms-render.test.ts` (1: the badge and the tab rendered with "Occluded by Cinder") |

## Screenshots

- `assets/115-badge-no-antenna.jpg`: the two-stage example on the pad: "No antenna" (the pod has none).
- `assets/115-badge-linked.jpg`: a probe core on the pad: "Linked to Space Center", four bars.
- `assets/115-comms-tab.jpg`: the Comms tab: Probe → Space Center, the station marked linked, the probe core's antenna switch.
- `assets/115-network-map.jpg`: map view with a second probe in a 100 km orbit: two link lines (`network lines: 2`) and the station marker.

## What surprised me

- **The switches had no visible label.** `Switch` carries its label only as `aria-label`; the vessel panel's group and part rows of plan 111 showed bare switches. Every row now shows its text beside the switch.
- **A crewed pod has no antenna.** The two-stage example reads "No antenna" on the pad: the comms model is right (a pod is a command source, not a transmitter), and the badge says why.
- **The HUD cannot switch vessels,** so the map screenshot shows the second probe's link from the first probe's view: the Network layer draws every vessel's link, not only the active one's.
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.
