# Wing lift, struts and fuel lines (plan 041)

Checked 2026-10-17. What the wing model and the connector rules rest on, and what could not be confirmed online.

| Fact | Used for | Source |
|---|---|---|
| Induced drag coefficient of a finite wing: `C_Di = C_L^2 / (pi AR e)`, `AR = b^2/S`, `e` the span efficiency (1 for an elliptic load). | Drag of `stock.wing` | https://en.wikipedia.org/wiki/Lift-induced_drag (2026-10-17) |
| Finite-wing lift slope from lifting-line theory: `a = a0 / (1 + a0 / (pi e AR))`, `a0 = 2 pi` per radian for a thin flat airfoil. The slope falls with falling aspect ratio. (Helmbold's elliptic flat-plate formula is a different, close expression; not used.) | `liftSlope` of `stock.wing`, derived from its aspect ratio | https://people.utm.my/shabudin/wp-content/blogs.dir/1281/files/2018/03/2-Finite-wing-Theory.pdf and https://sankar.gatech.edu/AE2020/ChapterV.PartIV.doc (2026-10-17; the Georgia Tech page gives the elliptic case, the UTM slide the `e` form) |
| Maximum lift-to-drag of a parabolic polar `C_D = C_D0 + C_L^2/(pi AR e)`: `(L/D)max = 1/2 sqrt(pi AR e / C_D0)` at `C_L = sqrt(C_D0 pi AR e)`. | Hand value for the glider test | derived from the line above (algebra) |
| Fuel lines in Kerbal Space Program are one-directional (source part to target part); decoupler cross-feed is two-way. Outer tanks drain first in an asparagus build with fuel lines. | Fuel line direction (parent end to target end) and "line sources first" draw order | forum reports found by search: https://forum.kerbalspaceprogram.com/topic/166871-suggestion-one-way-crossfeed-setting-for-decouplers and https://forum.kerbalspaceprogram.com/topic/214837-fuel-lines-misbehaving-asparagus-staging-broken (2026-10-17); the wiki page https://wiki.kerbalspaceprogram.com/wiki/Fuel_line refused the fetch (bot protection) |
| Stall angle of a thin cambered or flat wing is about 12 to 16 degrees; post-stall a flat plate approaches the broadside normal force with `C_N` about 1.2. | `stallAngle` 15 degrees, post-stall blend towards the fin's cross-flow law | not confirmed in a primary source in this search: a model constant (as `research/fin-aerodynamics.md`) |
| Struts in KSP-like games are purely structural (they stiffen a flexible build) and come off with the stage that holds one end. | Struts add no stiffness here (one rigid body, ADR 0018) and are cut on separation | game knowledge, not confirmed online |

What is not modelled: wing stall hysteresis, Mach effects, ground effect, flaps, sweep.
