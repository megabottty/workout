import {
  saveWorkoutDraft,
  loadWorkoutDraft,
  clearWorkoutDraft,
  WorkoutDraft,
} from './draft-storage.utils';

describe('draft-storage.utils', () => {
  const mockDraft: WorkoutDraft = {
    userId: 'user123',
    workoutDate: '2026-07-20',
    trainingDay: 'lower-a',
    programBlockId: 'pb-1',
    weekNumber: 3,
    customWeekName: 'Deload Week',
    workoutNotes: 'Felt strong',
    blocks: [
      {
        id: 'b1',
        name: 'Main',
        movements: [
          {
            id: 'm1',
            movementName: 'Deadlift',
            setEntries: [{ setNumber: 1, reps: 5, load: '315' }],
            notes: 'Easy',
          },
        ],
      },
    ],
    savedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('saves and loads a workout draft successfully', () => {
    saveWorkoutDraft(mockDraft);
    const loaded = loadWorkoutDraft('user123', '2026-07-20', 'lower-a', 'pb-1');

    expect(loaded).toBeTruthy();
    expect(loaded?.workoutNotes).toBe('Felt strong');
    expect(loaded?.weekNumber).toBe(3);
    expect(loaded?.customWeekName).toBe('Deload Week');
    expect(loaded?.blocks[0].movements[0].movementName).toBe('Deadlift');
  });

  it('returns null when no draft exists', () => {
    const loaded = loadWorkoutDraft('user123', '2026-07-21', 'upper-a', 'pb-1');
    expect(loaded).toBeNull();
  });

  it('clears a draft properly', () => {
    saveWorkoutDraft(mockDraft);
    expect(loadWorkoutDraft('user123', '2026-07-20', 'lower-a', 'pb-1')).not.toBeNull();

    clearWorkoutDraft('user123', '2026-07-20', 'lower-a', 'pb-1');
    expect(loadWorkoutDraft('user123', '2026-07-20', 'lower-a', 'pb-1')).toBeNull();
  });
});
