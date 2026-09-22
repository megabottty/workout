import {
  saveWorkoutDraft,
  loadWorkoutDraft,
  clearWorkoutDraft,
  clearLegacyLocalStorageDrafts,
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
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
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

  it('stores drafts in sessionStorage so they do not survive closing the browser', () => {
    saveWorkoutDraft(mockDraft);

    expect(sessionStorage.getItem('workout_draft_user123_2026-07-20_lower-a_pb-1')).toBeTruthy();
    expect(localStorage.getItem('workout_draft_user123_2026-07-20_lower-a_pb-1')).toBeNull();
  });

  it('removes legacy localStorage drafts without touching unrelated keys', () => {
    localStorage.setItem('workout_draft_user123_2026-01-01_lower-a_pb-1', '{}');
    localStorage.setItem('unrelated_key', 'keep-me');

    clearLegacyLocalStorageDrafts();

    expect(localStorage.getItem('workout_draft_user123_2026-01-01_lower-a_pb-1')).toBeNull();
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
  });
});
