import { groupSessionsByWeek } from './workout-history.utils';
import { WorkoutSession } from '../models/workout.models';

function makeSession(id: string, date: string): WorkoutSession {
  return {
    id,
    date,
    trainingDay: 'lower-a',
    notes: '',
    blocks: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

describe('groupSessionsByWeek', () => {
  it('groups sessions by Monday-start week and sorts weeks newest first', () => {
    const sessions = [
      makeSession('a', '2026-07-20'),
      makeSession('b', '2026-07-22'),
      makeSession('c', '2026-07-19'),
    ];

    const result = groupSessionsByWeek(sessions, 1);

    expect(result.length).toBe(2);
    expect(result[0].weekStartDate).toBe('2026-07-20');
    expect(result[0].sessions.map((session) => session.id)).toEqual(['b', 'a']);
    expect(result[1].weekStartDate).toBe('2026-07-13');
    expect(result[1].sessions.map((session) => session.id)).toEqual(['c']);
  });
});
