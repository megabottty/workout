import { TrainingDay } from '../models/workout.models';

export interface WorkoutDraft {
  userId: string;
  workoutDate: string;
  trainingDay: TrainingDay;
  programBlockId: string;
  weekNumber?: number;
  customWeekName?: string;
  workoutNotes: string;
  blocks: Array<{
    id: string;
    name: string;
    movements: Array<{
      id: string;
      movementName: string;
      setEntries: Array<{
        setNumber: number;
        reps: number | null;
        load: number | string | null;
      }>;
      notes: string;
    }>;
  }>;
  savedAt: string;
}

function getDraftKey(userId: string, date: string, day: TrainingDay, programBlockId: string): string {
  return `workout_draft_${userId}_${date}_${day}_${programBlockId}`;
}

export function saveWorkoutDraft(draft: WorkoutDraft): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = getDraftKey(draft.userId, draft.workoutDate, draft.trainingDay, draft.programBlockId);
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Ignore storage errors (quota, private mode)
  }
}

export function loadWorkoutDraft(
  userId: string,
  date: string,
  day: TrainingDay,
  programBlockId: string
): WorkoutDraft | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const key = getDraftKey(userId, date, day, programBlockId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as WorkoutDraft;
  } catch {
    return null;
  }
}

export function clearWorkoutDraft(
  userId: string,
  date: string,
  day: TrainingDay,
  programBlockId: string
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = getDraftKey(userId, date, day, programBlockId);
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}
