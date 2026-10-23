/**
 * How often the navball, the map markers, the target marks and the heat bars repaint (plan 396,
 * ADR 0330 point 1): the 3D render draws every frame, the HUD at this rate, so a 120 Hz frame spends
 * its CPU on the scene. The one place to change it. At or below this rate every frame repaints it.
 */
export const HUD_FRAME_HZ = 60;
