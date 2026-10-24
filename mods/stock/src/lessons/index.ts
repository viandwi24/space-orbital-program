/** Stock's lessons (plan 379, ADR 0355): the game's guided scenes, from the first launch to docking. */
import { defineLesson } from '@orbital/sdk';
import { BASIC_LESSONS } from './basics.ts';
import { FLIGHT_LESSONS } from './flight.ts';
import { ADVANCED_LESSONS } from './advanced.ts';

export const STOCK_LESSONS = [...BASIC_LESSONS, ...FLIGHT_LESSONS, ...ADVANCED_LESSONS].map(
	(lesson) => defineLesson({ ...lesson, id: `stock.${lesson.id}` })
);
