/**
 * The world history book (plan 102, ADR 0147 point 4): the world's firsts in time order with the
 * world's calendar date, exported as Markdown (one line each) and JSON.
 */
import {
	calendarOf,
	formatDate,
	homeBodyOf,
	type BodyDefinition,
	type Epoch,
	type MilestoneRecord
} from '@orbital/core';
import { milestoneTitle } from '../achievements/milestone-text';

export interface HistoryEntry {
	record: MilestoneRecord;
	date: string;
	text: string;
}

export interface HistoryContext {
	bodies: readonly BodyDefinition[];
	epoch: Epoch;
}

const homeOf = (bodies: readonly BodyDefinition[]): string => homeBodyOf(bodies)?.id ?? '';

/** The records in time order (ties in record order), each with its date and sentence. */
export function historyOf(
	records: readonly MilestoneRecord[],
	ctx: HistoryContext
): HistoryEntry[] {
	const calendar = calendarOf(ctx.bodies);
	const home = homeOf(ctx.bodies);
	return records
		.map((r, i) => [r, i] as const)
		.sort((a, b) => a[0].time - b[0].time || a[1] - b[1])
		.map(([record]) => ({
			record,
			date: formatDate(calendar, ctx.epoch, record.time).text,
			text: milestoneTitle(record, home)
		}));
}

/** Markdown: a heading, then one line per first. */
export function historyMarkdown(world: string, entries: readonly HistoryEntry[]): string {
	const lines = entries.map((e) => `- ${e.date}: ${e.text}`);
	return `# ${world}: history\n\n${lines.length > 0 ? lines.join('\n') : '_Nothing yet._'}\n`;
}

/** JSON: the records as saved, in time order. */
export const historyJson = (world: string, entries: readonly HistoryEntry[]): string =>
	JSON.stringify({ world, milestones: entries.map((e) => e.record) }, null, '\t');
