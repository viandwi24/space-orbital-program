/**
 * Challenges on the page (plan 131, ADR 0159 points 5 and 6): import a challenge file, the world
 * it plays in, and the local history of scored runs (per player, in browser storage).
 */
import {
	AXIS_INFO,
	bestScores,
	readChallenge,
	scoreRun,
	type ChallengeFile,
	type RunMeasure,
	type Score,
	type ScoreAxis
} from '@orbital/core';
import type { CreateWorldInput } from '../worlds/world-model';

/** What the page keeps: imported challenges, the world each is played in, and the scored runs. */
export interface ChallengeBook {
	challenges: Record<string, ChallengeFile>;
	/** World id → the challenge played there. */
	worlds: Record<string, string>;
	runs: Record<string, Score[][]>;
}

export interface BookStore {
	read(): ChallengeBook;
	write(book: ChallengeBook): void;
}

const EMPTY: ChallengeBook = { challenges: {}, worlds: {}, runs: {} };
const KEY = 'orbital.challenges';

/** Browser storage, or memory where it is unavailable (private windows, tests). */
export function bookStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = null): BookStore {
	let memory: ChallengeBook = structuredClone(EMPTY);
	return {
		read() {
			try {
				const text = storage?.getItem(KEY);
				return text ? { ...EMPTY, ...(JSON.parse(text) as ChallengeBook) } : memory;
			} catch {
				return memory;
			}
		},
		write(book) {
			memory = book;
			try {
				storage?.setItem(KEY, JSON.stringify(book));
			} catch {
				/* memory keeps it for this page */
			}
		}
	};
}

/** Imports a challenge file's text into the book; the reason in words when it is not one. */
export function importChallenge(
	store: BookStore,
	text: string
): { ok: true; challenge: ChallengeFile } | { ok: false; reason: string } {
	const read = readChallenge(text);
	if (!read.ok) return read;
	const book = store.read();
	store.write({ ...book, challenges: { ...book.challenges, [read.challenge.id]: read.challenge } });
	return read;
}

/** The world a challenge is played in: its preset, rules and system, from day one. */
export function challengeWorldInput(
	challenge: ChallengeFile,
	id: string,
	seed: number,
	systemVersion: string
): CreateWorldInput {
	return {
		id,
		seed,
		preset: challenge.preset,
		rules: { ...challenge.rules },
		start: { kind: 'day-one' },
		gravityModel: 'patched',
		systemId: challenge.system?.id ?? 'stock',
		systemVersion,
		variant: challenge.system?.variant ?? 'default'
	};
}

export function markWorld(store: BookStore, worldId: string, challengeId: string): void {
	const book = store.read();
	store.write({ ...book, worlds: { ...book.worlds, [worldId]: challengeId } });
}

/** The challenge played in `worldId`, if any. */
export const challengeOf = (store: BookStore, worldId: string): ChallengeFile | undefined => {
	const book = store.read();
	const id = book.worlds[worldId];
	return id === undefined ? undefined : book.challenges[id];
};

/**
 * A milestone was reached in `worldId`: when it is that world's challenge goal, the run is scored on
 * each axis and added to the challenge's history. Returns the scores, or null.
 */
export function finishRun(
	store: BookStore,
	worldId: string,
	milestone: string,
	measure: RunMeasure
): { challenge: ChallengeFile; scores: Score[]; best: Partial<Record<ScoreAxis, number>> } | null {
	const challenge = challengeOf(store, worldId);
	if (!challenge || challenge.goal !== milestone) return null;
	const scores = scoreRun(challenge, measure);
	const book = store.read();
	const runs = [...(book.runs[challenge.id] ?? []), scores];
	store.write({ ...book, runs: { ...book.runs, [challenge.id]: runs } });
	return { challenge, scores, best: bestScores(runs) };
}

/** "Cost 24 000 funds · Time 230 s …" for the toast. */
export const scoreText = (scores: readonly Score[]): string =>
	scores
		.map(
			(s) =>
				`${AXIS_INFO[s.axis].label} ${Math.round(s.value).toLocaleString('en-US')} ${AXIS_INFO[s.axis].unit}`
		)
		.join(' · ');
