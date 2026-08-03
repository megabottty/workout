export type TrainingDay = 'lower-a' | 'upper-a' | 'lower-b' | 'upper-b';

export interface SetEntry {
  setNumber: number;
  reps: number | null;
  load: number | null;
}

export interface MovementEntry {
  id: string;
  movementName: string;
  setEntries: SetEntry[];
  notes: string;
}

export interface WorkoutBlock {
  id: string;
  name: string;
  movements: MovementEntry[];
}

export interface WorkoutSession {
  id: string;
  date: string;
  trainingDay: TrainingDay;
  programBlockId: string;
  programBlockName: string;
  notes: string;
  blocks: WorkoutBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgramBlockTemplateMovement {
  movementName: string;
}

export interface ProgramBlockDefinition {
  id: string;
  name: string;
  totalWeeks: number;
  templatesByDay: Record<TrainingDay, ProgramBlockTemplateMovement[]>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredWorkoutData {
  version: 1;
  sessions: WorkoutSession[];
}
