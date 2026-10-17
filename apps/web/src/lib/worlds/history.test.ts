/** The history book (plan 102, ADR 0147 point 4). */
import { calendarOf, formatDate, loadPlugins, type MilestoneRecord } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { historyJson, historyMarkdown, historyOf } from './history';

const bodies = loadPlugins([Stock]).registries.bodies.list();
const epoch = { day: 0, fraction: 0 };
const records: MilestoneRecord[] = [
	{
		id: 'orbit:stock.home',
		kind: 'orbit',
		body: 'stock.home',
		crewed: false,
		vessel: 3,
		time: 230.3
	},
	{ id: 'launch', kind: 'launch', crewed: false, vessel: 3, time: 17.7 },
	{
		id: 'flyby:stock.cinder',
		kind: 'flyby',
		body: 'stock.cinder',
		crewed: false,
		vessel: 3,
		time: 90_000
	}
];

describe('world history', () => {
	it('the Markdown export has one line per milestone, in time order, with its calendar date', () => {
		const md = historyMarkdown('Kerbin Two', historyOf(records, { bodies, epoch }));
		const lines = md.split('\n').filter((l) => l.startsWith('- '));
		const calendar = calendarOf(bodies);
		expect(lines).toEqual([
			`- ${formatDate(calendar, epoch, 17.7).text}: First launch`,
			`- ${formatDate(calendar, epoch, 230.3).text}: First orbit of Home`,
			`- ${formatDate(calendar, epoch, 90_000).text}: First flyby of Cinder`
		]);
		expect(md.startsWith('# Kerbin Two: history')).toBe(true);
	});

	it('the JSON export parses back to the records, in time order', () => {
		const parsed = JSON.parse(historyJson('W', historyOf(records, { bodies, epoch })));
		expect(parsed.milestones.map((r: MilestoneRecord) => r.id)).toEqual([
			'launch',
			'orbit:stock.home',
			'flyby:stock.cinder'
		]);
		expect(parsed.milestones[1]).toEqual(records[0]);
	});

	it('a world with no firsts says so', () => {
		expect(historyMarkdown('W', [])).toContain('Nothing yet');
	});
});
