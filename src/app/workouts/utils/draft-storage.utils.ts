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

const DRAFT_KEY_PREFIX = 'workout_draft_';

function getDraftKey(userId: string, date: string, day: TrainingDay, programBlockId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}_${date}_${day}_${programBlockId}`;
}

function getDraftStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveWorkoutDraft(draft: WorkoutDraft): void {
  try {
    const storage = getDraftStorage();
    if (!storage) return;
    const key = getDraftKey(draft.userId, draft.workoutDate, draft.trainingDay, draft.programBlockId);
    storage.setItem(key, JSON.stringify(draft));
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
    const storage = getDraftStorage();
    if (!storage) return null;
    const raw = storage.getItem(getDraftKey(userId, date, day, programBlockId));
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
    const storage = getDraftStorage();
    if (!storage) return;
    storage.removeItem(getDraftKey(userId, date, day, programBlockId));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Drafts used to live in localStorage, which survived closing the browser and
 * let long-stale edits resurface. Remove any leftovers from that era.
 */
export function clearLegacyLocalStorageDrafts(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const staleKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}
