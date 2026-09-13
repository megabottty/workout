import { TrainingDay, WorkoutSession } from '../models/workout.models';

export interface PersonalBest {
  movementName: string;
  maxLoad: number;
  reps: number | null;
  loadDisplay: string;
  date: string;
  trainingDay: TrainingDay;
  blockName: string;
}

export function parseNumericLoad(load: number | string | null | undefined): number | null {
  if (load === null || load === undefined) {
    return null;
  }

  if (typeof load === 'number') {
    return Number.isFinite(load) ? load : null;
  }

  const str = String(load).trim();
  if (!str) {
    return null;
  }

  // Check if string contains bodyweight with addition like "BW+25" or "BW + 25"
  const bwMatch = str.match(/^(?:bw|bodyweight)\s*\+\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (bwMatch) {
    return Number(bwMatch[1]);
  }

  // Regular number like "185" or "185.5" or "185 lbs"
  const numMatch = str.match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (numMatch) {
    return Number(numMatch[1]);
  }

  return null;
}

export function formatLoadDisplay(load: number | string | null | undefined): string {
  if (load === null || load === undefined || load === '') {
    return '';
  }

  return String(load);
}

export function calculateMovementPersonalBests(sessions: WorkoutSession[]): Map<string, PersonalBest> {
  const pbs = new Map<string, PersonalBest>();

  for (const session of sessions) {
    for (const block of session.blocks) {
      for (const movement of block.movements) {
        const name = movement.movementName.trim();
        const normalized = name.toLowerCase();
        if (!normalized) continue;

        for (const set of movement.setEntries) {
          const numLoad = parseNumericLoad(set.load);
          if (numLoad === null || numLoad <= 0) continue;

          const existing = pbs.get(normalized);
          if (!existing || numLoad > existing.maxLoad || (numLoad === existing.maxLoad && (set.reps ?? 0) > (existing.reps ?? 0))) {
            pbs.set(normalized, {
              movementName: name,
              maxLoad: numLoad,
              reps: set.reps,
              loadDisplay: formatLoadDisplay(set.load),
              date: session.date,
              trainingDay: session.trainingDay,
              blockName: block.name,
            });
          }
        }
      }
    }
  }

  return pbs;
}

export function isNewPersonalRecord(
  currentLoad: number | string | null | undefined,
  currentReps: number | null | undefined,
  personalBest: PersonalBest | null | undefined
): boolean {
  const numCurrent = parseNumericLoad(currentLoad);
  if (numCurrent === null || numCurrent <= 0) {
    return false;
  }

  if (!personalBest) {
    return true;
  }

  if (numCurrent > personalBest.maxLoad) {
    return true;
  }

  if (numCurrent === personalBest.maxLoad && (currentReps ?? 0) > (personalBest.reps ?? 0) && (currentReps ?? 0) > 0) {
    return true;
  }

  return false;
}
