import { TrainingDay, WorkoutSession } from '../models/workout.models';
import { TRAINING_DAY_ORDER } from './workout-history.utils';

/**
 * A "block week" is one pass through the four training days of a program
 * block. It has nothing to do with the calendar: it starts with whatever day
 * is logged first (any weekday) and ends when all four days are done, or when
 * a day is repeated before the week was finished.
 */
export interface BlockWeek {
  /** `${programBlockId}__${weekNumber}` — stable key for UI state maps. */
  key: string;
  programBlockId: string;
  programBlockName: string;
  weekNumber: number;
  /** From the first session in the week that carries one (manual "Edit week" name). */
  customWeekName?: string;
  /** Newest first. */
  sessions: WorkoutSession[];
  startDate: string;
  endDate: string;
  /** Training days logged in this week, in program order. */
  completedDays: TrainingDay[];
  /** True once all four training days have been logged. */
  isComplete: boolean;
}

export interface BlockWeekAssignment {
  /** Newest first (by end date, then program block name). */
  weeks: BlockWeek[];
  weekBySessionId: Map<string, BlockWeek>;
}

type MutableWeek = Omit<BlockWeek, 'completedDays' | 'isComplete' | 'sessions'> & {
  sessions: WorkoutSession[];
  days: Set<TrainingDay>;
};

export function assignBlockWeeks(sessions: WorkoutSession[]): BlockWeekAssignment {
  const byProgramBlock = new Map<string, WorkoutSession[]>();
  for (const session of sessions) {
    const existing = byProgramBlock.get(session.programBlockId) ?? [];
    existing.push(session);
    byProgramBlock.set(session.programBlockId, existing);
  }

  const weeks: BlockWeek[] = [];
  const weekBySessionId = new Map<string, BlockWeek>();

  for (const [programBlockId, blockSessions] of byProgramBlock) {
    const ordered = blockSessions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    let current: MutableWeek | null = null;
    const finished: MutableWeek[] = [];

    const closeCurrent = (): void => {
      if (current) {
        finished.push(current);
        current = null;
      }
    };

    for (const session of ordered) {
      const manualWeek = session.weekNumber;
      let nextWeekNumber: number;

      if (typeof manualWeek === 'number') {
        // A manually set week pins this session; counting continues from it.
        nextWeekNumber = manualWeek;
        if (current && current.weekNumber !== manualWeek) {
          closeCurrent();
        }
      } else if (!current) {
        nextWeekNumber = 1;
      } else if (current.days.has(session.trainingDay) || current.days.size >= TRAINING_DAY_ORDER.length) {
        // Repeating a day, or all four done: this session starts the next week.
        nextWeekNumber = current.weekNumber + 1;
        closeCurrent();
      } else {
        nextWeekNumber = current.weekNumber;
      }

      if (!current) {
        current = {
          key: `${programBlockId}__${nextWeekNumber}`,
          programBlockId,
          programBlockName: session.programBlockName,
          weekNumber: nextWeekNumber,
          sessions: [],
          startDate: session.date,
          endDate: session.date,
          days: new Set<TrainingDay>(),
        };
      }

      current.sessions.push(session);
      current.days.add(session.trainingDay);
      current.endDate = session.date;
      if (!current.customWeekName && session.customWeekName) {
        current.customWeekName = session.customWeekName;
      }
    }
    closeCurrent();

    for (const week of finished) {
      const built: BlockWeek = {
        key: week.key,
        programBlockId: week.programBlockId,
        programBlockName: week.programBlockName,
        weekNumber: week.weekNumber,
        ...(week.customWeekName ? { customWeekName: week.customWeekName } : {}),
        sessions: week.sessions.slice().sort((a, b) => b.date.localeCompare(a.date)),
        startDate: week.startDate,
        endDate: week.endDate,
        completedDays: TRAINING_DAY_ORDER.filter((day) => week.days.has(day)),
        isComplete: TRAINING_DAY_ORDER.every((day) => week.days.has(day)),
      };
      weeks.push(built);
      for (const session of built.sessions) {
        weekBySessionId.set(session.id, built);
      }
    }
  }

  weeks.sort(
    (a, b) =>
      b.endDate.localeCompare(a.endDate) ||
      b.weekNumber - a.weekNumber ||
      a.programBlockName.localeCompare(b.programBlockName)
  );

  return { weeks, weekBySessionId };
}

/**
 * The week number the next workout for `trainingDay` in `programBlockId`
 * would land in: the newest week if that day is still open in it, otherwise
 * the following week.
 */
export function nextBlockWeekNumber(
  assignment: BlockWeekAssignment,
  programBlockId: string,
  trainingDay: TrainingDay
): number {
  const newest = assignment.weeks
    .filter((week) => week.programBlockId === programBlockId)
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  if (!newest) {
    return 1;
  }
  if (newest.isComplete || newest.completedDays.includes(trainingDay)) {
    return newest.weekNumber + 1;
  }
  return newest.weekNumber;
}
