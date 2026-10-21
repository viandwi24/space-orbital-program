/**
 * Auto Dock's alignment display (plan 330), drawn on the panel canvas like KSP's Docking Port
 * Alignment Indicator: the crosshair is the target port's axis seen from our port, the green lines
 * are where our port is off that axis (log scale, in the target port's frame), the orange ring is
 * where our port points (centred: face to face), and the corners read distance, closing speed,
 * angle and phase.
 */
import { rotateByQuat, type PanelCanvas, type Vec3, type VesselPilot } from '@orbital/sdk';

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** A distance on a log scale to 0..1 of the half width (100 m reaches the edge). */
const logScale = (m: number): number =>
	Math.sign(m) * Math.min(1, Math.log10(1 + Math.abs(m)) / Math.log10(101));

export function drawAlignment(c: PanelCanvas, pilot: VesselPilot | null, phase: string): void {
	const w = c.width;
	const h = c.height;
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min(w, h) / 2 - 14;
	c.clear();
	c.fillStyle('#0b0f14');
	c.beginPath();
	c.rect(0, 0, w, h);
	c.fill();
	// crosshair with ticks
	c.strokeStyle('#d7dde6');
	c.lineWidth(1);
	c.beginPath();
	c.moveTo(cx - r, cy);
	c.lineTo(cx + r, cy);
	c.moveTo(cx, cy - r);
	c.lineTo(cx, cy + r);
	for (let k = 1; k <= 4; k++) {
		const d = (r * k) / 4;
		for (const s of [-1, 1]) {
			c.moveTo(cx + s * d, cy - 3);
			c.lineTo(cx + s * d, cy + 3);
			c.moveTo(cx - 3, cy + s * d);
			c.lineTo(cx + 3, cy + s * d);
		}
	}
	c.stroke();
	c.fillStyle('#d7dde6');
	c.fillText('DOCK ALIGN', cx - 34, 12, 10);
	const a = pilot?.alignment();
	const port = pilot?.targetPort;
	if (!pilot || !a || !port) {
		c.fillStyle('#9aa4b2');
		c.fillText('Control from a port and target a port', 8, h - 8, 10);
		return;
	}
	// the target port's frame: its face along +Y, x and z across it
	const ex = rotateByQuat(port.orientation, { x: 1, y: 0, z: 0 });
	const ez = rotateByQuat(port.orientation, { x: 0, y: 0, z: 1 });
	// green: our offset from the axis
	const lx = cx + logScale(dot(a.lateral, ex)) * r;
	const ly = cy - logScale(dot(a.lateral, ez)) * r;
	c.strokeStyle('#3ddc84');
	c.lineWidth(1.5);
	c.beginPath();
	c.moveTo(lx, cy - r);
	c.lineTo(lx, cy + r);
	c.moveTo(cx - r, ly);
	c.lineTo(cx + r, ly);
	c.stroke();
	// orange: where our face points, against the reverse of theirs (centred when face to face)
	const own = pilot.controlPort?.direction;
	if (own) {
		const tx = cx + Math.max(-1, Math.min(1, dot(own, ex) * 3)) * r;
		const ty = cy - Math.max(-1, Math.min(1, dot(own, ez) * 3)) * r;
		c.strokeStyle('#ff8a3d');
		c.lineWidth(2);
		c.beginPath();
		c.arc(tx, ty, 9, 0, Math.PI * 2);
		c.moveTo(tx - 16, ty);
		c.lineTo(tx - 9, ty);
		c.moveTo(tx + 9, ty);
		c.lineTo(tx + 16, ty);
		c.stroke();
	}
	c.fillStyle('#d7dde6');
	c.fillText(`DST ${a.distance.toFixed(1)}`, 6, h - 6, 11);
	c.fillText(`CVEL ${a.closing.toFixed(2)}`, w - 74, h - 6, 11);
	c.fillText(`${((a.angle * 180) / Math.PI).toFixed(1)}°`, w - 44, 12, 11);
	c.fillText(phase.toUpperCase(), 6, 12, 10);
}
