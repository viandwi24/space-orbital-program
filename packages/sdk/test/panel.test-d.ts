/**
 * Type test (plan 112, ADR 0149): a full panel definition, canvas included, compiles under this
 * package's tsconfig, whose `lib` is ESNext only: no DOM types are needed to write a panel.
 */
import { definePanel, type PanelCanvas, type PanelInput } from '../src/index.ts';

const draw = (c: PanelCanvas, input: PanelInput): void => {
	c.clear();
	c.strokeStyle('#ffffff');
	c.lineWidth(1.5);
	c.beginPath();
	c.arc(c.width / 2, c.height / 2, 20, 0, Math.PI * 2);
	c.stroke();
	c.fillText(String(Math.round(input.altitude ?? 0)), 4, 12, 10);
};

export const panel = definePanel({
	id: 'demo.altimeter',
	title: 'Altimeter',
	icon: { path: 'M4 20h16M12 4v12' },
	order: 600,
	contexts: ['flight', 'map'],
	view: {
		kind: 'section',
		children: [
			{ kind: 'readout', label: 'Altitude', value: (i) => i.altitude, unit: 'm' },
			{ kind: 'meter', label: 'Fuel', value: () => 0.5 },
			{ kind: 'sparkline', label: 'Speed', value: (i) => i.speed },
			{
				kind: 'button',
				label: 'Stage',
				command: (i) => (i.vessel ? { type: 'stage', vessel: i.vessel.id } : null)
			},
			{ kind: 'list', items: (i) => (i.vessel ? [{ name: i.vessel.name ?? 'Vessel' }] : []) }
		]
	},
	canvas: { height: 80, draw }
});

// @ts-expect-error a panel has no DOM element field
definePanel({ ...panel, element: null as unknown });
