# SAS, torque and turning in KSP (checked 2026-10-21)

For plan 310's owner report: in orbit, a big rocket switched between SAS modes almost instantly.

## What KSP does

- **Reaction wheels** turn a craft on all three axes, wherever they sit on it. Their electric draw scales with the torque they give. Example: the Mk1 Command Pod gives up to 2.4 kNm per axis. Source: [KSP wiki, Reaction wheel](https://wiki.kerbalspaceprogram.com/wiki/Reaction_wheel).
- **RCS** torque depends on each thruster's lever arm to the centre of mass. Players use it to turn large craft, which wheels turn slowly. Sources: [KSP forum, torque wheel positioning](https://forum.kerbalspaceprogram.com/topic/124446-torque-wheel-positioning) and [KSP forum, about torque](https://forum.kerbalspaceprogram.com/topic/47484-about-torque).
- **Rails warp freezes the attitude.** KSP's on-rails warp switches SAS off and stops the rotation; mods such as MandatoryRCS keep the vessel pointed at the SAS selection during warp instead. Sources: [KSP forum, rotations and SAS during time warp](https://forum.kerbalspaceprogram.com/topic/130475-rotations-and-sas-during-time-warp) and [MandatoryRCS](https://spacedock.info/mod/1327/MandatoryRCS).
- **The active vessel is always in physics** within loading range. A turn at 1× therefore always takes the vessel's own torque.

## What we do (plan 310)

- At physics warp, a SAS turn of more than 2° on rails puts the vessel in flight before the step. The turn then takes its wheels, RCS and gimbal through the existing torque-limited SAS (ADR 0049).
- At rails warp the direction is still held analytically, as plan 257 decided.
- A vessel whose last flight step measured zero torque does not turn on rails. A SAS or RCS command measures it again.
