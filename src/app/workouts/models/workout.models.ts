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

// ─── Social / Friends ────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  /** Initials shown as avatar, auto-derived from displayName if not set */
  avatarInitials: string;
  createdAt: string;
  updatedAt: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  toUid: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorkoutReactionEmoji = '💪' | '🔥' | '👏' | '🏆' | '😤';

export interface WorkoutReaction {
  uid: string;
  displayName: string;
  emoji: WorkoutReactionEmoji;
  createdAt: string;
}

export interface WorkoutComment {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: string;
}

export interface SharedWorkout {
  id: string;
  ownerUid: string;
  ownerDisplayName: string;
  session: WorkoutSession;
  caption: string;
  /** Map of emoji → array of UIDs that reacted with that emoji */
  reactions: Record<WorkoutReactionEmoji, WorkoutReaction[]>;
  comments: WorkoutComment[];
  sharedAt: string;
  updatedAt: string;
}
