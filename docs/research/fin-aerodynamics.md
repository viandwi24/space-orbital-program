# Fin aerodynamics and radial attachment (plan 026)

Checked 2026-10-16. What the sim's fin model rests on, and what could not be confirmed online.

| Fact | Used for | Source |
|---|---|---|
| Normal and axial force coefficients resolve into lift and drag as `C_L = C_N cos a - C_A sin a`, `C_D = C_A cos a + C_N sin a`. A fin is modelled by its normal force only; the part along the flow is the induced drag. | `stock.fin` returns one force along the plate normal | https://ntrs.nasa.gov/api/citations/19630005431/downloads/19630005431.pdf (2026-10-16) |
| A rocket is statically stable when the centre of pressure is behind the centre of gravity (rule of thumb: at least one body diameter); the fins supply the aft normal force that moves it. | The stability test (finned vs unfinned) and the fin placement in the example vessel | https://dept.aem.umn.edu/~./faculty/flaten/AEM1905RocketrySampleDocuments/CG_and_CP_Slides.pdf (2026-10-16) |
| Thin-airfoil lift slope `2 pi` per radian for a flat plate (infinite aspect ratio). A fin has low aspect ratio, so its slope is lower; the stock fin uses 2.0 per radian. | `liftSlope` default | Thin-airfoil theory; only a forum page was found in the search, so the value is a tuned model constant, not a measured one. |
| Cross-flow drag of a flat plate normal to the flow, `C_d` about 1.2 (Hoerner, Fluid-Dynamic Drag). The search did not return Hoerner's table; the NASA re-entry report in the same search shows the cross-flow coefficient depends on Reynolds and Mach number. | `crossflow` default 1.2 (stall: the force keeps growing with `sin^2 a` instead of vanishing) | not confirmed online; model constant |

Model used (`mods/stock`, ADR 0035): with `a` the angle between the airflow and the plate plane and `V` the airspeed, the force along the plate normal is `-1/2 rho V^2 S (C_La sin a cos a + C_d90 sin a |sin a|)`. For small `a` it reduces to `-1/2 rho S C_La V v_n` (linear lift slope). Nothing in it is validated against wind-tunnel data; the test is qualitative (restoring moment sign, finned rocket stays near prograde, unfinned diverges).
