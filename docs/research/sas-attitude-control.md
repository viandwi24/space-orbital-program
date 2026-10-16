# SAS and attitude control (plan 042)

Checked 2026-10-17.

## Attitude control law

- Quaternion error feedback with rate damping, a limiter on the error and integral action zeroed during large slews: <https://arxiv.org/pdf/2009.03459> (LRO-style law; the integral gain is zeroed during a slew to avoid overshoot). We use the same structure: vector part of the error quaternion (eigen-axis), rate feedback, integrator only near the target.
- Slew-rate-constrained, time-efficient rate-feedback tracking: <https://arxiv.org/pdf/2408.09246> (the regulating rate is shaped along the eigen-axis so a slew-rate bound holds while time to regulation is minimised). Our desired-rate profile `min(Kp e, sqrt(2 f a e), w_max)` is this idea with the deceleration capability `a` of the actuators.
- Eigen-axis error dynamics on SO(3): <https://iafastro.directory/iac/archive/browse/IAC-14/C1/4/26208/>.
- Quaternion-vector-part feedback winds up beyond 180 degrees of error (<https://arxiv.org/pdf/2504.03222>): we always take the shortest rotation (flip the sign of `w < 0`).

## Behaviour players expect (KSP)

- Stability assist holds the attitude held when SAS was switched on; the other selectable targets are prograde, retrograde, normal, antinormal, radial in, radial out (target and maneuver later): <https://wiki.kerbalspaceprogram.com/wiki/Stability_Augmentation_System> and <https://wiki.kerbalspaceprogram.com/wiki/Direction_selector>. The wiki's SAS page is flagged out of date; the behaviour above is stable across versions.
- Player input overrides SAS while held; SAS resumes holding the new attitude on release (same pages, forum discussion <https://forum.kerbalspaceprogram.com/topic/148999-additional-sas-functionality-relating-to-stability-assist>).
