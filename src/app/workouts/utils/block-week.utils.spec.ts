import { TrainingDay, WorkoutSession } from '../models/workout.models';
import { assignBlockWeeks, nextBlockWeekNumber } from './block-week.utils';

function session(
  id: string,
  date: string,
  trainingDay: TrainingDay,
  extra: Partial<WorkoutSession> = {}
): WorkoutSession {
  return {
    id,
    date,
    trainingDay,
    programBlockId: 'block-1',
    programBlockName: 'Program Block 1',
    notes: '',
    blocks: [],
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    ...extra,
  };
}

describe('assignBlockWeeks', () => {
  it('returns nothing for no sessions', () => {
    const result = assignBlockWeeks([]);
    expect(result.weeks).toEqual([]);
    expect(result.weekBySessionId.size).toBe(0);
  });

  it('puts four different days into one complete week regardless of weekday', () => {
    // Starts on a Friday and finishes the following Thursday — not a calendar week.
    const result = assignBlockWeeks([
      session('a', '2026-09-11', 'lower-a'),
      session('b', '2026-09-13', 'upper-a'),
      session('c', '2026-09-15', 'lower-b'),
      session('d', '2026-09-17', 'upper-b'),
    ]);

    expect(result.weeks.length).toBe(1);
    const [week] = result.weeks;
    expect(week.weekNumber).toBe(1);
    expect(week.isComplete).toBeTrue();
    expect(week.startDate).toBe('2026-09-11');
    expect(week.endDate).toBe('2026-09-17');
    expect(week.completedDays).toEqual(['lower-a', 'upper-a', 'lower-b', 'upper-b']);
    expect(week.sessions.map((s) => s.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(result.weekBySessionId.get('c')?.weekNumber).toBe(1);
  });

  it('starts the next week after the fourth day is done', () => {
    const result = assignBlockWeeks([
      session('a', '2026-09-01', 'lower-a'),
      session('b', '2026-09-02', 'upper-a'),
      session('c', '2026-09-03', 'lower-b'),
      session('d', '2026-09-04', 'upper-b'),
      session('e', '2026-09-05', 'lower-a'),
    ]);

    expect(result.weeks.map((w) => w.weekNumber)).toEqual([2, 1]);
    expect(result.weekBySessionId.get('e')?.weekNumber).toBe(2);
    expect(result.weeks[0].isComplete).toBeFalse();
  });

  it('treats a repeated day as the start of the next week when a day was skipped', () => {
    const result = assignBlockWeeks([
      session('a', '2026-09-01', 'lower-a'),
      session('b', '2026-09-02', 'upper-a'),
      session('c', '2026-09-04', 'lower-b'),
      // Upper B skipped; Lower A again starts week 2.
      session('d', '2026-09-08', 'lower-a'),
      session('e', '2026-09-09', 'upper-a'),
    ]);

    const [week2, week1] = result.weeks;
    expect(week1.weekNumber).toBe(1);
    expect(week1.isComplete).toBeFalse();
    expect(week1.completedDays).toEqual(['lower-a', 'upper-a', 'lower-b']);
    expect(week2.weekNumber).toBe(2);
    expect(week2.sessions.map((s) => s.id)).toEqual(['e', 'd']);
  });

  it('counts program blocks independently', () => {
    const result = assignBlockWeeks([
      session('a', '2026-08-01', 'lower-a'),
      session('b', '2026-08-02', 'lower-a'),
      session('c', '2026-09-01', 'lower-a', { programBlockId: 'block-2', programBlockName: 'Program Block 2' }),
    ]);

    expect(result.weekBySessionId.get('b')?.weekNumber).toBe(2);
    expect(result.weekBySessionId.get('c')?.weekNumber).toBe(1);
    expect(result.weekBySessionId.get('c')?.programBlockId).toBe('block-2');
    // Newest first.
    expect(result.weeks[0].key).toBe('block-2__1');
  });

  it('respects a manual week number and keeps counting from it', () => {
    const result = assignBlockWeeks([
      session('a', '2026-09-01', 'lower-a'),
      session('b', '2026-09-02', 'upper-a', { weekNumber: 5, customWeekName: 'Deload' }),
      session('c', '2026-09-03', 'lower-b'),
      session('d', '2026-09-04', 'upper-b'),
      // Lower A hasn't been done in week 5 yet, so it completes week 5…
      session('e', '2026-09-05', 'lower-a'),
      // …and the next Upper A starts week 6.
      session('f', '2026-09-06', 'upper-a'),
    ]);

    expect(result.weekBySessionId.get('a')?.weekNumber).toBe(1);
    expect(result.weekBySessionId.get('b')?.weekNumber).toBe(5);
    expect(result.weekBySessionId.get('c')?.weekNumber).toBe(5);
    expect(result.weekBySessionId.get('e')?.weekNumber).toBe(5);
    expect(result.weekBySessionId.get('e')?.isComplete).toBeTrue();
    expect(result.weekBySessionId.get('f')?.weekNumber).toBe(6);
    expect(result.weekBySessionId.get('b')?.customWeekName).toBe('Deload');
  });
});

describe('nextBlockWeekNumber', () => {
  it('is 1 with no sessions in the block', () => {
    expect(nextBlockWeekNumber(assignBlockWeeks([]), 'block-1', 'lower-a')).toBe(1);
  });

  it('stays in the newest week while that day is still open', () => {
    const assignment = assignBlockWeeks([
      session('a', '2026-09-01', 'lower-a'),
      session('b', '2026-09-02', 'upper-a'),
    ]);
    expect(nextBlockWeekNumber(assignment, 'block-1', 'lower-b')).toBe(1);
  });

  it('moves to the next week when the day was already done or the week is complete', () => {
    const open = assignBlockWeeks([session('a', '2026-09-01', 'lower-a')]);
    expect(nextBlockWeekNumber(open, 'block-1', 'lower-a')).toBe(2);

    const complete = assignBlockWeeks([
      session('a', '2026-09-01', 'lower-a'),
      session('b', '2026-09-02', 'upper-a'),
      session('c', '2026-09-03', 'lower-b'),
      session('d', '2026-09-04', 'upper-b'),
    ]);
    expect(nextBlockWeekNumber(complete, 'block-1', 'lower-b')).toBe(2);
  });
});
