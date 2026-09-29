import { TrainingDay, WorkoutSession } from '../models/workout.models';

export const TRAINING_DAY_ORDER: TrainingDay[] = [
  'lower-a',
  'upper-a',
  'lower-b',
  'upper-b',
];

export const TRAINING_DAY_LABELS: Record<TrainingDay, string> = {
  'lower-a': 'Lower Day A',
  'upper-a': 'Upper Day A',
  'lower-b': 'Lower Day B',
  'upper-b': 'Upper Day B',
};

/** "Sep 14, 2026", or "Sun, Sep 14, 2026" with `includeWeekday`. */
export function formatFriendlyDate(dateIso: string, includeWeekday = false): string {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }
  return date.toLocaleDateString(undefined, {
    ...(includeWeekday ? { weekday: 'short' } : {}),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
