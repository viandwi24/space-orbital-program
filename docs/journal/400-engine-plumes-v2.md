# 400 — Engine plumes v2

**Plan:** [plans/400-engine-plumes-v2.md](../plans/400-engine-plumes-v2.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0335](../decisions/0335-engine-plume-templates.md)

## What was done

| Where | What |
|---|---|
| `core/schemas.ts`, `sdk` | `plumeTemplateSchema`, `PLUME_PROPELLANTS`, the optional `plume.template` |
| `renderer/effects/plume-template.ts` | propellant bases (colours, sea-level core share, diamonds, length, width, emission, smoke), `resolveTemplate`, the density (^0.5128), remap and ignition controllers, `templateLook` (the template's scales on `plumeShape`, with chamber pressure) |
| `plume-mesh.ts` | colours from the template, the shape from `templateLook`; Low hides the outer flame and the diamonds (`plumeQuality`, set from the preset) |
| `plume-cluster.ts`, `system.ts` | `clusterLights`: one light per cluster of nozzles within 6 bell radii, intensity from the summed thrust; a pool of three point lights at Medium and High |
| `presets.ts` | `plume: 'low' | 'medium' | 'high'` |
| `mods/stock` | a template on every engine and motor (`test/plume-templates.test.ts` pins them) |

## Notes

- The default template reproduces the plume as it was (a test checks length, radius, brightness and diamonds at four pressures and three throttles).
- The cluster light is a PointLight pool; the count is fixed so no pipeline recompiles in flight. Switching between Low and Medium adds or removes the three lights, as the floodlights' rule already costs (the governor only moves to presets that are warm).

## Not done

- **The volumetric layer** with the soft depth fade, the noise controller, the extra meshes and LOD by screen size: the plan's High-level pieces. The shell and flame still use the two cones and the sprite. Plan 393's depth would feed the fade.
- **Captures**: no before and after screenshots of the engines on a test stand (`400-engines-sea.jpg`, `400-engines-vacuum.jpg`), and no frame-time run at the pad cluster against plan 392's baseline or on low-end hardware. A live look at the pad ignition was not possible in this session's world (its flight was lost on launch), so the colours are unchecked by eye.
- The owner's look at the plumes against reference image 03 ([manual]).
