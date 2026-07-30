import { Injectable } from '@angular/core';
import { Firestore, collection, doc, getDoc, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';

import { MovementEntry, SetEntry, TrainingDay, WorkoutBlock, WorkoutSession } from '../models/workout.models';

export type SaveWorkoutInput = {
  date: string;
  trainingDay: TrainingDay;
  notes: string;
  blocks: Array<{
    name: string;
    movements: Array<{
      movementName: string;
      setEntries: Array<{
        setNumber: number;
        reps: number | null;
        load: number | null;
      }>;
      notes: string;
    }>;
  }>;
};

@Injectable({ providedIn: 'root' })
export class WorkoutStorageService {
  constructor(private readonly firestore: Firestore) {}

  async getSessions(userId: string): Promise<WorkoutSession[]> {
    const safeUserId = this.assertUserId(userId);
    const workoutsRef = collection(this.firestore, `users/${safeUserId}/workouts`);
    const snapshot = await getDocs(query(workoutsRef, orderBy('date', 'desc')));

    return snapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data();
      return this.normalizeSession({
        id: docSnapshot.id,
        ...data,
      });
    });
  }

  async getSessionByDateAndDay(userId: string, date: string, trainingDay: TrainingDay): Promise<WorkoutSession | null> {
    const safeUserId = this.assertUserId(userId);
    const sessionRef = doc(this.firestore, `users/${safeUserId}/workouts/${this.workoutDocId(date, trainingDay)}`);
    const snapshot = await getDoc(sessionRef);
    if (snapshot.exists()) {
      return this.normalizeSession({
        id: snapshot.id,
        ...snapshot.data(),
      });
    }

    // Backward compatibility for older records saved by date-only ID.
    const legacyRef = doc(this.firestore, `users/${safeUserId}/workouts/${date}`);
    const legacySnapshot = await getDoc(legacyRef);
    if (!legacySnapshot.exists()) {
      return null;
    }

    const normalizedLegacy = this.normalizeSession({
      id: legacySnapshot.id,
      ...legacySnapshot.data(),
    });

    return normalizedLegacy.trainingDay === trainingDay ? normalizedLegacy : null;
  }

  async saveSession(userId: string, input: SaveWorkoutInput): Promise<WorkoutSession> {
    const safeUserId = this.assertUserId(userId);
    if (!input.date) {
      throw new Error('Workout date is required.');
    }

    const sessionRef = doc(this.firestore, `users/${safeUserId}/workouts/${this.workoutDocId(input.date, input.trainingDay)}`);
    const existingSnapshot = await getDoc(sessionRef);
    const now = new Date().toISOString();
    let createdAt = existingSnapshot.exists()
      ? (existingSnapshot.data()['createdAt'] as string | undefined) ?? now
      : now;
    if (!existingSnapshot.exists()) {
      // Backward compatibility for older records saved by date-only ID.
      const legacyRef = doc(this.firestore, `users/${safeUserId}/workouts/${input.date}`);
      const legacySnapshot = await getDoc(legacyRef);
      if (legacySnapshot.exists()) {
        const legacy = this.normalizeSession({
          id: legacySnapshot.id,
          ...legacySnapshot.data(),
        });
        if (legacy.trainingDay === input.trainingDay) {
          createdAt = legacy.createdAt;
        }
      }
    }

    const data = {
      date: input.date,
      trainingDay: input.trainingDay,
      notes: input.notes.trim(),
      blocks: input.blocks.map((block) => ({
        id: crypto.randomUUID(),
        name: block.name.trim(),
        movements: block.movements.map((movement) => ({
          id: crypto.randomUUID(),
          movementName: movement.movementName.trim(),
          setEntries: movement.setEntries.map((setEntry) => ({
            setNumber: setEntry.setNumber,
            reps: setEntry.reps,
            load: setEntry.load,
          })),
          notes: movement.notes.trim(),
        })),
      })),
      createdAt,
      updatedAt: now,
    };

    await setDoc(sessionRef, data);

    return this.normalizeSession({
      id: input.date,
      ...data,
    });
  }

  private normalizeSession(value: unknown): WorkoutSession {
    if (!value || typeof value !== 'object') {
      throw new Error('Workout session is invalid.');
    }

    const candidate = value as Partial<WorkoutSession>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.date !== 'string' ||
      typeof candidate.notes !== 'string' ||
      typeof candidate.createdAt !== 'string' ||
      typeof candidate.updatedAt !== 'string' ||
      !Array.isArray(candidate.blocks)
    ) {
      throw new Error('Workout session has missing fields.');
    }

    return {
      id: candidate.id,
      date: candidate.date,
      trainingDay: this.normalizeTrainingDay(candidate.trainingDay),
      notes: candidate.notes,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      blocks: candidate.blocks.map((block) => this.normalizeBlock(block)),
    };
  }

  private normalizeBlock(value: unknown): WorkoutBlock {
    if (!value || typeof value !== 'object') {
      throw new Error('Workout block is invalid.');
    }

    const candidate = value as Partial<WorkoutBlock>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      !Array.isArray(candidate.movements)
    ) {
      throw new Error('Workout block has missing fields.');
    }

    return {
      id: candidate.id,
      name: candidate.name,
      movements: candidate.movements.map((movement) =>
        this.normalizeMovement(movement)
      ),
    };
  }

  private normalizeMovement(value: unknown): MovementEntry {
    if (!value || typeof value !== 'object') {
      throw new Error('Movement entry is invalid.');
    }

    const candidate = value as Partial<MovementEntry>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.movementName !== 'string' ||
      typeof candidate.notes !== 'string'
    ) {
      throw new Error('Movement entry has missing fields.');
    }

    return {
      id: candidate.id,
      movementName: candidate.movementName,
      notes: candidate.notes,
      setEntries: this.normalizeSetEntries(candidate),
    };
  }

  private normalizeSetEntries(candidate: Partial<MovementEntry> & {
    sets?: unknown;
    reps?: unknown;
    load?: unknown;
    setEntries?: unknown;
  }): SetEntry[] {
    if (Array.isArray(candidate.setEntries)) {
      if (candidate.setEntries.length === 0) {
        return this.createDefaultSetEntries();
      }

      return candidate.setEntries
        .map((entry, index) => this.normalizeSetEntry(entry, index + 1));
    }

    const sets = this.normalizeNullableNumber(candidate.sets);
    const reps = this.normalizeNullableNumber(candidate.reps);
    const load = this.normalizeNullableNumber(candidate.load);
    const filledSets = sets ?? ((reps !== null || load !== null) ? 1 : 0);

    return Array.from({ length: Math.max(2, filledSets) }, (_value, index) => ({
      setNumber: index + 1,
      reps: index < filledSets ? reps : null,
      load: index < filledSets ? load : null,
    }));
  }

  private normalizeSetEntry(value: unknown, fallbackSetNumber: number): SetEntry {
    if (!value || typeof value !== 'object') {
      throw new Error('Set entry is invalid.');
    }

    const candidate = value as Partial<SetEntry>;
    const setNumber = typeof candidate.setNumber === 'number'
      ? candidate.setNumber
      : fallbackSetNumber;

    return {
      setNumber,
      reps: this.normalizeNullableNumber(candidate.reps),
      load: this.normalizeNullableNumber(candidate.load),
    };
  }

  private normalizeNullableNumber(value: unknown): number | null {
    if (value === null || typeof value === 'number') {
      return value;
    }

    throw new Error('Numeric fields must be numbers or null.');
  }

  private normalizeTrainingDay(value: unknown): TrainingDay {
    if (
      value === 'lower-a' ||
      value === 'upper-a' ||
      value === 'lower-b' ||
      value === 'upper-b'
    ) {
      return value;
    }

    return 'upper-a';
  }

  private workoutDocId(date: string, trainingDay: TrainingDay): string {
    return `${date}__${trainingDay}`;
  }

  private createDefaultSetEntries(): SetEntry[] {
    return Array.from({ length: 2 }, (_value, index) => ({
      setNumber: index + 1,
      reps: null,
      load: null,
    }));
  }

  private assertUserId(userId: string): string {
    const safeUserId = userId.trim();
    if (!safeUserId) {
      throw new Error('You must be signed in.');
    }

    return safeUserId;
  }
}
