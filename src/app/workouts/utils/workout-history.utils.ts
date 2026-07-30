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

export interface WeekGroup {
  weekStartDate: string;
  weekLabel: string;
  sessions: WorkoutSession[];
}

export function groupSessionsByWeek(
  sessions: WorkoutSession[],
  weekStartsOn: 0 | 1 = 1
): WeekGroup[] {
  const grouped = new Map<string, WorkoutSession[]>();

  for (const session of sessions) {
    const key = getWeekStartDateKey(session.date, weekStartsOn);
    const existing = grouped.get(key) ?? [];
    existing.push(session);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartDate, weekSessions]) => ({
      weekStartDate,
      weekLabel: `Week of ${formatDate(weekStartDate)}`,
      sessions: weekSessions
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

export function getWeekStartDateKey(dateIso: string, weekStartsOn: 0 | 1): string {
  const date = new Date(`${dateIso}T12:00:00`);
  const day = date.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
