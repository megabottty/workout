import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../../social/services/social-storage.service';
import { ProgramBlockDefinition, TrainingDay, WorkoutSession } from '../../models/workout.models';
import { SaveWorkoutInput, WorkoutStorageService } from '../../services/workout-storage.service';
import { ComponentCanDeactivate } from '../../guards/unsaved-changes.guard';
import {
  DEFAULT_PROGRAM_BLOCK_ID,
  DEFAULT_PROGRAM_BLOCK_NAME,
  ProgramBlockOption,
  buildDefaultNextProgramBlockName,
  normalizeTotalWeeks,
  parseTemplateMovements,
} from '../../utils/program-block.utils';
import {
  PersonalBest,
  calculateMovementPersonalBests,
  formatLoadDisplay,
  isNewPersonalRecord,
  parseNumericLoad,
} from '../../utils/personal-best.utils';
import {
  WorkoutDraft,
  clearLegacyLocalStorageDrafts,
  clearWorkoutDraft,
  loadWorkoutDraft,
  saveWorkoutDraft,
} from '../../utils/draft-storage.utils';
import { TRAINING_DAY_LABELS, TRAINING_DAY_ORDER } from '../../utils/workout-history.utils';
import { findLikelyDuplicateMovementName } from '../../utils/movement-similarity.utils';

export type DraftMovement = {
  id: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | string | null;
  }>;
  notes: string;
  keyboardMode?: 'numeric' | 'text';
};

export type DraftBlock = {
  id: string;
  name: string;
  movements: DraftMovement[];
};

export type MovementReference = {
  sourceDate: string;
  blockName: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | string | null;
  }>;
  notes: string;
};

export type MovementHistoryEntry = {
  sessionId: string;
  sessionDate: string;
  trainingDay: TrainingDay;
  blockName: string;
  programBlockName: string;
  weekNumber: number | null;
  customWeekName: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | string | null;
  }>;
  notes: string;
  /** Heaviest numeric load recorded in this session, used for the trend badge. */
  bestLoad: number | null;
  /** Difference between this session's best load and the next-older session's. */
  loadDelta: number | null;
  isPersonalBest: boolean;
};

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type PendingSave = {
  userId: string;
  input: SaveWorkoutInput;
  signature: string;
};

const DRAFT_DEBOUNCE_MS = 400;
const FIRESTORE_AUTOSAVE_DEBOUNCE_MS = 1500;
const INLINE_HISTORY_ENTRY_COUNT = 3;

type ShareRecipientOption = {
  uid: string;
  displayName: string;
};

@Component({
  selector: 'app-workout-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workout-log.component.html',
  styleUrl: './workout-log.component.scss',
})
export class WorkoutLogComponent implements ComponentCanDeactivate {
  readonly workoutDate = signal(new Date().toISOString().slice(0, 10));
  readonly trainingDay = signal<TrainingDay>('lower-a');
  readonly selectedProgramBlockId = signal(DEFAULT_PROGRAM_BLOCK_ID);
  readonly showAllProgramBlockHistory = signal(true);
  readonly workoutNotes = signal('');
  readonly manualWeekNumber = signal<number | null>(null);
  readonly customWeekName = signal('');
  readonly isManualWeek = signal(false);
  blocks: DraftBlock[] = [this.createBlock(1)];

  // Edit / Reordering Mode
  readonly isEditMode = signal(false);
  readonly draggedMovement = signal<{ blockId: string; index: number } | null>(null);
  readonly dragOverTarget = signal<{ blockId: string; index: number } | null>(null);

  // Draft persistence
  readonly isDraftRestored = signal(false);
  readonly saveState = signal<SaveState>('idle');
  /** True while edits exist that have not been committed to Firestore yet. */
  readonly hasUnsavedChanges = computed(() => {
    const state = this.saveState();
    return state === 'pending' || state === 'saving' || state === 'error';
  });

  // "Did you mean X?" movement-name duplicate prompt
  readonly duplicateNamePrompt = signal<{ movementId: string; typedName: string; suggestedName: string } | null>(null);

  readonly isEditingExisting = signal(false);
  /** Transient confirmation text for program-block create/edit actions. */
  readonly saveMessage = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly copiedFromDate = signal('');
  readonly copyWeekMessage = signal('');
  readonly allSessions = signal<WorkoutSession[]>([]);
  readonly programBlockDefinitions = signal<ProgramBlockDefinition[]>([]);

  // Share to feed
  readonly shareCaption = signal('');
  readonly isSharing = signal(false);
  readonly shareMessage = signal('');
  readonly lastSavedSession = signal<WorkoutSession | null>(null);
  readonly shareRecipients = signal<ShareRecipientOption[]>([]);
  readonly selectedShareRecipientUids = signal<Set<string>>(new Set());

  // Program Block Modal (Create & Edit)
  readonly isProgramBlockModalOpen = signal(false);
  readonly modalMode = signal<'create' | 'edit'>('create');
  readonly modalEditingBlockId = signal('');
  readonly isSavingProgramBlock = signal(false);
  readonly modalErrorMessage = signal('');
  readonly modalProgramBlockName = signal('');
  readonly modalProgramBlockTotalWeeks = signal(8);
  readonly modalMovementTemplates = signal<Record<TrainingDay, string>>({
    'lower-a': '',
    'upper-a': '',
    'lower-b': '',
    'upper-b': '',
  });

  readonly programBlockOptions = computed(() => {
    const uniqueBlocks = new Map<string, ProgramBlockOption>();

    for (const definition of this.programBlockDefinitions()) {
      uniqueBlocks.set(definition.id, {
        id: definition.id,
        name: definition.name,
      });
    }

    for (const session of this.allSessions()) {
      if (!uniqueBlocks.has(session.programBlockId)) {
        uniqueBlocks.set(session.programBlockId, {
          id: session.programBlockId,
          name: session.programBlockName,
        });
      }
    }

    if (!uniqueBlocks.has(DEFAULT_PROGRAM_BLOCK_ID)) {
      uniqueBlocks.set(DEFAULT_PROGRAM_BLOCK_ID, {
        id: DEFAULT_PROGRAM_BLOCK_ID,
        name: DEFAULT_PROGRAM_BLOCK_NAME,
      });
    }

    return Array.from(uniqueBlocks.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly selectedProgramBlockDefinition = computed(() =>
    this.programBlockDefinitions().find((definition) => definition.id === this.selectedProgramBlockId()) ?? null
  );

  readonly selectedProgramBlockName = computed(() => {
    const selectedId = this.selectedProgramBlockId();
    return this.programBlockOptions().find((option) => option.id === selectedId)?.name ?? DEFAULT_PROGRAM_BLOCK_NAME;
  });

  readonly sessionsForSelectedProgramBlock = computed(() =>
    this.allSessions().filter((session) => session.programBlockId === this.selectedProgramBlockId())
  );

  readonly selectedProgramBlockStartDate = computed(() => {
    const sorted = this.sessionsForSelectedProgramBlock()
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    return sorted[0]?.date ?? null;
  });

  readonly computedProgramWeek = computed(() => {
    const startDate = this.selectedProgramBlockStartDate();
    if (!startDate) {
      return 1;
    }

    return this.weekNumberWithinProgramBlock(this.workoutDate(), startDate);
  });

  readonly currentProgramWeek = computed(() => {
    if (this.isManualWeek() && this.manualWeekNumber() !== null) {
      return this.manualWeekNumber()!;
    }
    return this.computedProgramWeek();
  });

  readonly currentProgramWeekLabel = computed(() => {
    const currentWeek = this.currentProgramWeek();
    const customName = this.customWeekName().trim();
    const definition = this.selectedProgramBlockDefinition();
    const totalWeeksPart = definition ? ` of ${definition.totalWeeks}` : '';

    if (customName) {
      return `${customName} (Week ${currentWeek}${totalWeeksPart})`;
    }

    return `Week ${currentWeek}${totalWeeksPart}`;
  });

  readonly sessionsForMovementHistory = computed(() => {
    const pool = this.showAllProgramBlockHistory()
      ? this.allSessions()
      : this.sessionsForSelectedProgramBlock();

    const currentDate = this.workoutDate();
    const currentDay = this.trainingDay();
    const currentProgramBlockId = this.selectedProgramBlockId();

    // The workout being edited isn't "history" — excluding it keeps trend
    // deltas and the entry list meaningful once auto-save starts writing.
    return pool.filter(
      (session) =>
        !(
          session.date === currentDate &&
          session.trainingDay === currentDay &&
          session.programBlockId === currentProgramBlockId
        )
    );
  });

  readonly recentSessionsForDay = computed(() =>
    this.sessionsForSelectedProgramBlock()
      .filter((session) => session.trainingDay === this.trainingDay())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
  );

  readonly previousSessionForDay = computed(() => {
    const currentDate = this.workoutDate();
    const day = this.trainingDay();
    return this.sessionsForSelectedProgramBlock().find(
      (session) => session.trainingDay === day && session.date < currentDate
    ) ?? null;
  });

  readonly movementOptions = computed(() => {
    const names = new Set<string>();
    // From all sessions across all blocks
    for (const session of this.allSessions()) {
      for (const block of session.blocks) {
        for (const movement of block.movements) {
          const name = movement.movementName.trim();
          if (name.length > 0) {
            names.add(name);
          }
        }
      }
    }
    // From all program block templates
    for (const def of this.programBlockDefinitions()) {
      for (const day of TRAINING_DAY_ORDER) {
        for (const template of def.templatesByDay[day] ?? []) {
          const name = template.movementName.trim();
          if (name.length > 0) {
            names.add(name);
          }
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  });

  readonly personalBests = computed(() =>
    calculateMovementPersonalBests(this.allSessions())
  );

  readonly movementHistoryByName = computed(() => {
    const history = new Map<string, MovementHistoryEntry[]>();
    const personalBests = this.personalBests();
    const sessions = this.sessionsForMovementHistory()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      for (const block of session.blocks) {
        for (const movement of block.movements) {
          const normalized = movement.movementName.trim().toLowerCase();
          if (normalized.length === 0) {
            continue;
          }

          const setEntries = movement.setEntries.map((setEntry) => ({
            setNumber: setEntry.setNumber,
            reps: setEntry.reps,
            load: setEntry.load,
          }));

          const existing = history.get(normalized) ?? [];
          existing.push({
            sessionId: session.id,
            sessionDate: session.date,
            trainingDay: session.trainingDay,
            blockName: block.name,
            programBlockName: session.programBlockName,
            weekNumber: session.weekNumber ?? null,
            customWeekName: session.customWeekName ?? '',
            movementName: movement.movementName,
            setEntries,
            notes: movement.notes,
            bestLoad: this.bestNumericLoad(setEntries),
            loadDelta: null,
            isPersonalBest: false,
          });
          history.set(normalized, existing);
        }
      }
    }

    for (const [normalized, entries] of history) {
      const personalBest = personalBests.get(normalized) ?? null;

      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const older = entries[index + 1];

        if (entry.bestLoad !== null && older?.bestLoad != null) {
          entry.loadDelta = Number((entry.bestLoad - older.bestLoad).toFixed(2));
        }

        entry.isPersonalBest =
          personalBest !== null &&
          entry.bestLoad !== null &&
          entry.bestLoad === personalBest.maxLoad &&
          entry.sessionDate === personalBest.date;
      }
    }

    return history;
  });

  readonly trainingDayOptions = TRAINING_DAY_ORDER.map((value) => ({
    value,
    label: TRAINING_DAY_LABELS[value],
  }));
  readonly trainingDayLabels = TRAINING_DAY_LABELS;
  readonly selectedShareRecipientLabels = computed(() => {
    const selected = this.selectedShareRecipientUids();
    return this.shareRecipients()
      .filter((recipient) => selected.has(recipient.uid))
      .map((recipient) => recipient.displayName);
  });

  private loadToken = 0;
  private loadedShareRecipientsForUid = '';
  private autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private firestoreSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: PendingSave | null = null;
  private saveInFlight: Promise<void> | null = null;
  private lastSavedSignature = '';

  constructor(
    private readonly workoutStorage: WorkoutStorageService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly socialStorage: SocialStorageService,
  ) {
    clearLegacyLocalStorageDrafts();

    effect(() => {
      const user = this.authService.user();
      const date = this.workoutDate();
      const day = this.trainingDay();

      if (!user) {
        this.resetState();
        void this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      void this.loadSelection(user.uid, date, day);
    }, { allowSignalWrites: true });
  }

  /**
   * Used by unsavedChangesGuard. Auto-save normally lands before navigation, so
   * we flush first and only refuse (prompting the user) if that write failed.
   */
  async canDeactivate(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }

    return this.flushPendingSave();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  // ─── Edit Mode & Drag-and-Drop Reordering ─────────────────────────────────

  toggleEditMode(): void {
    this.isEditMode.update((v) => !v);
  }

  onDragStart(event: DragEvent, blockId: string, index: number): void {
    this.draggedMovement.set({ blockId, index });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${blockId}:${index}`);
    }
  }

  onDragOver(event: DragEvent, blockId: string, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverTarget.set({ blockId, index });
  }

  onDragLeave(event: DragEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !relatedTarget.closest('.movement-row')) {
      this.dragOverTarget.set(null);
    }
  }

  onDrop(event: DragEvent, targetBlockId: string, targetIndex: number): void {
    event.preventDefault();
    const source = this.draggedMovement();
    this.draggedMovement.set(null);
    this.dragOverTarget.set(null);

    if (!source) return;

    const sourceBlock = this.blocks.find((b) => b.id === source.blockId);
    const targetBlock = this.blocks.find((b) => b.id === targetBlockId);
    if (!sourceBlock || !targetBlock) return;

    const [movedMovement] = sourceBlock.movements.splice(source.index, 1);
    if (!movedMovement) return;

    targetBlock.movements.splice(targetIndex, 0, movedMovement);
    this.scheduleAutoSaveDraft();
  }

  onDragEnd(): void {
    this.draggedMovement.set(null);
    this.dragOverTarget.set(null);
  }

  moveMovementUp(blockId: string, index: number): void {
    if (index <= 0) return;
    const block = this.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const item = block.movements[index];
    block.movements[index] = block.movements[index - 1];
    block.movements[index - 1] = item;
    this.scheduleAutoSaveDraft();
  }

  moveMovementDown(blockId: string, index: number): void {
    const block = this.blocks.find((b) => b.id === blockId);
    if (!block || index >= block.movements.length - 1) return;

    const item = block.movements[index];
    block.movements[index] = block.movements[index + 1];
    block.movements[index + 1] = item;
    this.scheduleAutoSaveDraft();
  }

  moveMovementToBlock(sourceBlockId: string, movementId: string, targetBlockId: string): void {
    if (sourceBlockId === targetBlockId) return;
    const sourceBlock = this.blocks.find((b) => b.id === sourceBlockId);
    const targetBlock = this.blocks.find((b) => b.id === targetBlockId);
    if (!sourceBlock || !targetBlock) return;

    const index = sourceBlock.movements.findIndex((m) => m.id === movementId);
    if (index === -1) return;

    const [moved] = sourceBlock.movements.splice(index, 1);
    targetBlock.movements.push(moved);
    this.scheduleAutoSaveDraft();
  }

  // ─── Block & Movement Management ──────────────────────────────────────────

  addBlock(): void {
    this.blocks.push(this.createBlock(this.blocks.length + 1));
    this.scheduleAutoSaveDraft();
  }

  removeBlock(blockId: string): void {
    if (this.blocks.length === 1) {
      return;
    }

    this.blocks = this.blocks.filter((block) => block.id !== blockId);
    this.scheduleAutoSaveDraft();
  }

  addMovement(blockId: string): void {
    const block = this.blocks.find((candidate) => candidate.id === blockId);
    if (!block) {
      return;
    }

    block.movements.push(this.createMovement());
    this.scheduleAutoSaveDraft();
  }

  removeMovement(blockId: string, movementId: string): void {
    const block = this.blocks.find((candidate) => candidate.id === blockId);
    if (!block || block.movements.length === 1) {
      return;
    }

    block.movements = block.movements.filter((movement) => movement.id !== movementId);
    this.scheduleAutoSaveDraft();
  }

  addSet(movement: DraftMovement): void {
    const defaultLoad = movement.setEntries.find((setEntry) => setEntry.load !== null)?.load ?? null;
    movement.setEntries.push({
      setNumber: movement.setEntries.length + 1,
      reps: null,
      load: defaultLoad,
    });
    this.scheduleAutoSaveDraft();
  }

  removeSet(movement: DraftMovement, setIndex: number): void {
    if (movement.setEntries.length <= 1) {
      return;
    }

    movement.setEntries.splice(setIndex, 1);
    movement.setEntries = movement.setEntries.map((setEntry, index) => ({
      ...setEntry,
      setNumber: index + 1,
    }));
    this.scheduleAutoSaveDraft();
  }

  toggleKeyboardMode(movement: DraftMovement): void {
    movement.keyboardMode = movement.keyboardMode === 'text' ? 'numeric' : 'text';
    this.scheduleAutoSaveDraft();
  }

  isTextMode(movement: DraftMovement): boolean {
    return movement.keyboardMode === 'text';
  }

  // ─── Personal Best & PR helpers ───────────────────────────────────────────

  personalBestFor(movementName: string): PersonalBest | null {
    const normalized = movementName.trim().toLowerCase();
    if (!normalized) return null;
    return this.personalBests().get(normalized) ?? null;
  }

  isSetPR(movementName: string, load: number | string | null, reps: number | null): boolean {
    const pb = this.personalBestFor(movementName);
    return isNewPersonalRecord(load, reps, pb);
  }

  // ─── Manual Week Controls ─────────────────────────────────────────────────

  toggleManualWeek(): void {
    this.isManualWeek.update((v) => !v);
    if (this.isManualWeek() && this.manualWeekNumber() === null) {
      this.manualWeekNumber.set(this.computedProgramWeek());
    }
    this.scheduleAutoSaveDraft();
  }

  onManualWeekChange(val: number): void {
    this.manualWeekNumber.set(val);
    this.scheduleAutoSaveDraft();
  }

  onCustomWeekNameChange(val: string): void {
    this.customWeekName.set(val);
    this.scheduleAutoSaveDraft();
  }

  // ─── Draft Persistence ────────────────────────────────────────────────────

  onFieldChange(): void {
    this.scheduleAutoSaveDraft();
  }

  // ─── Movement Name Duplicate Detection ("did you mean X?") ────────────────

  onMovementNameBlur(movement: DraftMovement): void {
    const typedName = movement.movementName.trim();
    if (!typedName) {
      this.duplicateNamePrompt.set(null);
      return;
    }

    const suggestion = findLikelyDuplicateMovementName(typedName, this.movementOptions());
    if (suggestion) {
      this.duplicateNamePrompt.set({ movementId: movement.id, typedName, suggestedName: suggestion });
    } else if (this.duplicateNamePrompt()?.movementId === movement.id) {
      this.duplicateNamePrompt.set(null);
    }
  }

  acceptSuggestedMovementName(movement: DraftMovement): void {
    const prompt = this.duplicateNamePrompt();
    if (!prompt || prompt.movementId !== movement.id) return;

    movement.movementName = prompt.suggestedName;
    this.duplicateNamePrompt.set(null);
    this.scheduleAutoSaveDraft();
  }

  dismissDuplicateNamePrompt(): void {
    this.duplicateNamePrompt.set(null);
  }

  discardDraft(): void {
    const user = this.authService.user();
    if (user) {
      clearWorkoutDraft(user.uid, this.workoutDate(), this.trainingDay(), this.selectedProgramBlockId());
    }
    this.cancelPendingSave();
    this.isDraftRestored.set(false);
    this.loadSelectionFromCache(this.workoutDate(), this.trainingDay(), true);
  }

  private scheduleAutoSaveDraft(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    this.autoSaveTimeout = setTimeout(() => {
      this.saveDraftToStorage();
    }, DRAFT_DEBOUNCE_MS);

    this.scheduleFirestoreSave();
  }

  private saveDraftToStorage(): void {
    const user = this.authService.user();
    if (!user) return;

    const draft: WorkoutDraft = {
      userId: user.uid,
      workoutDate: this.workoutDate(),
      trainingDay: this.trainingDay(),
      programBlockId: this.selectedProgramBlockId(),
      weekNumber: this.isManualWeek() && this.manualWeekNumber() !== null ? this.manualWeekNumber()! : undefined,
      customWeekName: this.customWeekName().trim() || undefined,
      workoutNotes: this.workoutNotes(),
      blocks: this.blocks.map((b) => ({
        id: b.id,
        name: b.name,
        movements: b.movements.map((m) => ({
          id: m.id,
          movementName: m.movementName,
          setEntries: m.setEntries.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps,
            load: s.load,
          })),
          notes: m.notes,
        })),
      })),
      savedAt: new Date().toISOString(),
    };

    saveWorkoutDraft(draft);
  }

  // ─── Auto-save & Share Workout ────────────────────────────────────────────

  /** Builds the payload written to Firestore from the current form state. */
  private buildSaveInput(): SaveWorkoutInput {
    return {
      date: this.workoutDate(),
      trainingDay: this.trainingDay(),
      programBlockId: this.selectedProgramBlockId(),
      programBlockName: this.selectedProgramBlockName(),
      weekNumber: this.isManualWeek() && this.manualWeekNumber() !== null ? this.manualWeekNumber()! : undefined,
      customWeekName: this.customWeekName().trim() || undefined,
      notes: this.workoutNotes(),
      blocks: this.blocks
        .filter((block) => block.name.trim().length > 0 || block.movements.some((movement) => movement.movementName.trim().length > 0))
        .map((block) => ({
          name: block.name.trim() || 'Unnamed block',
          movements: block.movements
            .filter((movement) => movement.movementName.trim().length > 0)
            .map((movement) => ({
              movementName: movement.movementName.trim(),
              setEntries: movement.setEntries.map((setEntry) => ({
                setNumber: setEntry.setNumber,
                reps: setEntry.reps,
                load: setEntry.load,
              })),
              notes: movement.notes,
            })),
        }))
        .filter((block) => block.movements.length > 0),
    };
  }

  private workoutSignature(input: SaveWorkoutInput): string {
    return JSON.stringify({
      date: input.date,
      trainingDay: input.trainingDay,
      programBlockId: input.programBlockId,
      programBlockName: input.programBlockName,
      weekNumber: input.weekNumber ?? null,
      customWeekName: input.customWeekName ?? '',
      notes: input.notes.trim(),
      blocks: input.blocks,
    });
  }

  private sessionSignature(session: WorkoutSession): string {
    return this.workoutSignature({
      date: session.date,
      trainingDay: session.trainingDay,
      programBlockId: session.programBlockId,
      programBlockName: session.programBlockName,
      weekNumber: session.weekNumber,
      customWeekName: session.customWeekName,
      notes: session.notes,
      blocks: session.blocks.map((block) => ({
        name: block.name,
        movements: block.movements.map((movement) => ({
          movementName: movement.movementName,
          setEntries: movement.setEntries.map((setEntry) => ({
            setNumber: setEntry.setNumber,
            reps: setEntry.reps,
            load: setEntry.load,
          })),
          notes: movement.notes,
        })),
      })),
    });
  }

  /**
   * Snapshots the current form immediately (so a later date/day/program-block
   * switch still writes to the document the edits belong to) and debounces the
   * actual Firestore write.
   */
  private scheduleFirestoreSave(): void {
    const user = this.authService.user();
    if (!user) {
      return;
    }

    const input = this.buildSaveInput();
    if (input.blocks.length === 0 && !this.lastSavedSession()) {
      // Nothing worth persisting yet — don't create an empty document, and drop
      // any earlier snapshot so a cleared form can't resurrect old movements.
      this.cancelPendingSave();
      return;
    }

    const signature = this.workoutSignature(input);
    if (signature === this.lastSavedSignature) {
      this.pendingSave = null;
      this.clearFirestoreSaveTimeout();
      if (this.saveState() === 'pending') {
        this.saveState.set('saved');
      }
      return;
    }

    this.pendingSave = { userId: user.uid, input, signature };
    this.saveState.set('pending');

    this.clearFirestoreSaveTimeout();
    this.firestoreSaveTimeout = setTimeout(() => {
      this.firestoreSaveTimeout = null;
      void this.flushPendingSave();
    }, FIRESTORE_AUTOSAVE_DEBOUNCE_MS);
  }

  /** Writes any snapshotted edits now. Resolves false only when a write failed. */
  private async flushPendingSave(): Promise<boolean> {
    this.clearFirestoreSaveTimeout();

    while (this.pendingSave || this.saveInFlight) {
      const inFlight = this.saveInFlight;
      if (inFlight) {
        await inFlight.catch(() => undefined);
        continue;
      }

      const pending = this.pendingSave!;
      this.pendingSave = null;
      this.saveState.set('saving');

      const attempt = this.persistSnapshot(pending);
      this.saveInFlight = attempt;
      try {
        await attempt;
      } catch {
        return false;
      } finally {
        if (this.saveInFlight === attempt) {
          this.saveInFlight = null;
        }
      }
    }

    return this.saveState() !== 'error';
  }

  private async persistSnapshot(snapshot: PendingSave): Promise<void> {
    try {
      const saved = await this.workoutStorage.saveSession(snapshot.userId, snapshot.input);

      const stillViewingSnapshot =
        snapshot.input.date === this.workoutDate() &&
        snapshot.input.trainingDay === this.trainingDay() &&
        snapshot.input.programBlockId === this.selectedProgramBlockId();

      if (stillViewingSnapshot) {
        this.lastSavedSession.set(saved);
        this.lastSavedSignature = snapshot.signature;
        this.isEditingExisting.set(true);
        this.isDraftRestored.set(false);
      }

      this.errorMessage.set('');
      this.saveState.set(this.pendingSave ? 'pending' : 'saved');
      clearWorkoutDraft(snapshot.userId, snapshot.input.date, snapshot.input.trainingDay, snapshot.input.programBlockId);

      // Refresh history/PB data only — rebuilding `blocks` here would wipe out
      // whatever the user is typing right now.
      const sessions = await this.workoutStorage.getSessions(snapshot.userId);
      this.allSessions.set(sessions);
    } catch (error: unknown) {
      this.saveState.set('error');
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to save workout.');
      throw error;
    }
  }

  private clearFirestoreSaveTimeout(): void {
    if (this.firestoreSaveTimeout) {
      clearTimeout(this.firestoreSaveTimeout);
      this.firestoreSaveTimeout = null;
    }
  }

  private cancelPendingSave(): void {
    this.clearFirestoreSaveTimeout();
    this.pendingSave = null;
    this.saveState.set('idle');
  }

  /** Immediate save, used by form submit (Enter) and the retry affordance. */
  async saveNow(): Promise<boolean> {
    this.scheduleFirestoreSave();
    return this.flushPendingSave();
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  trackBySetNumber(_index: number, item: { setNumber: number }): number {
    return item.setNumber;
  }

  trackBySessionId(_index: number, item: { sessionId: string }): string {
    return item.sessionId;
  }

  async shareWorkout(): Promise<void> {
    const session = this.lastSavedSession();
    if (!session) {
      this.errorMessage.set('Save this workout first, or open an existing saved workout before sharing.');
      return;
    }

    const user = this.authService.user();
    if (!user) return;

    this.isSharing.set(true);
    this.shareMessage.set('');
    this.errorMessage.set('');

    try {
      const profile = await this.socialStorage.getProfile(user.uid);
      if (!profile) {
        this.errorMessage.set('Please set up your profile before sharing. Go to Profile in the nav.');
        return;
      }
      const availableRecipientUids = new Set(this.shareRecipients().map((recipient) => recipient.uid));
      const recipients = Array.from(this.selectedShareRecipientUids()).filter((uid) => availableRecipientUids.has(uid));
      if (recipients.length === 0) {
        this.errorMessage.set('Choose at least one friend to share with.');
        return;
      }

      await this.socialStorage.shareWorkout(user.uid, profile.displayName, session, this.shareCaption(), recipients);
      this.shareMessage.set(`Shared with ${recipients.length} friend${recipients.length === 1 ? '' : 's'} 🎉`);
      this.shareCaption.set('');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not share workout.');
    } finally {
      this.isSharing.set(false);
    }
  }

  toggleShareRecipient(uid: string): void {
    this.selectedShareRecipientUids.update((existing) => {
      const next = new Set(existing);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }

  isShareRecipientSelected(uid: string): boolean {
    return this.selectedShareRecipientUids().has(uid);
  }

  selectAllShareRecipients(): void {
    this.selectedShareRecipientUids.set(new Set(this.shareRecipients().map((recipient) => recipient.uid)));
  }

  clearShareRecipients(): void {
    this.selectedShareRecipientUids.set(new Set());
  }

  movementNames(block: { movements: Array<{ movementName: string }> }): string {
    return block.movements.map((movement) => movement.movementName).join(', ');
  }

  movementHistoryFor(movementName: string): MovementHistoryEntry[] {
    const normalized = movementName.trim().toLowerCase();
    if (normalized.length === 0) {
      return [];
    }

    return this.movementHistoryByName().get(normalized) ?? [];
  }

  /** Most recent sessions, shown expanded so the last few weeks are always visible. */
  inlineMovementHistoryFor(movementName: string): MovementHistoryEntry[] {
    return this.movementHistoryFor(movementName).slice(0, INLINE_HISTORY_ENTRY_COUNT);
  }

  olderMovementHistoryFor(movementName: string): MovementHistoryEntry[] {
    return this.movementHistoryFor(movementName).slice(INLINE_HISTORY_ENTRY_COUNT);
  }

  hasMovementContext(movementName: string): boolean {
    return this.movementReferenceFor(movementName) !== null || this.movementHistoryFor(movementName).length > 0;
  }

  historyDayLabel(entry: MovementHistoryEntry): string {
    return TRAINING_DAY_LABELS[entry.trainingDay];
  }

  historyWeekLabel(entry: MovementHistoryEntry): string {
    const custom = entry.customWeekName.trim();
    if (custom && entry.weekNumber !== null) {
      return `${custom} · Week ${entry.weekNumber}`;
    }
    if (custom) {
      return custom;
    }
    if (entry.weekNumber !== null) {
      return `Week ${entry.weekNumber}`;
    }
    return '';
  }

  formatLoadDelta(delta: number | null): string {
    if (delta === null) {
      return '';
    }
    if (delta === 0) {
      return 'same load';
    }
    return delta > 0 ? `+${delta}` : `${delta}`;
  }

  formatSetEntry(setEntry: { setNumber: number; reps: number | null; load: number | string | null }): string {
    const reps = setEntry.reps === null ? '—' : `${setEntry.reps}`;
    const load = formatLoadDisplay(setEntry.load);
    return load ? `${reps} × ${load}` : reps;
  }

  private bestNumericLoad(
    setEntries: Array<{ setNumber: number; reps: number | null; load: number | string | null }>
  ): number | null {
    let best: number | null = null;
    for (const setEntry of setEntries) {
      const numeric = parseNumericLoad(setEntry.load);
      if (numeric === null || numeric <= 0) {
        continue;
      }
      if (best === null || numeric > best) {
        best = numeric;
      }
    }
    return best;
  }

  movementReferenceFor(movementName: string): MovementReference | null {
    const reference = this.previousSessionForDay();
    if (!reference) {
      return null;
    }

    const normalized = movementName.trim().toLowerCase();
    if (normalized.length === 0) {
      return null;
    }

    for (const block of reference.blocks) {
      for (const movement of block.movements) {
        if (movement.movementName.trim().toLowerCase() === normalized) {
          return {
            sourceDate: reference.date,
            blockName: block.name,
            movementName: movement.movementName,
            setEntries: movement.setEntries.map((setEntry) => ({
              setNumber: setEntry.setNumber,
              reps: setEntry.reps,
              load: setEntry.load,
            })),
            notes: movement.notes,
          };
        }
      }
    }

    return null;
  }

  onWorkoutDateChange(): void {
    void this.flushPendingSave();
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
  }

  onTrainingDayChange(): void {
    void this.flushPendingSave();
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
  }

  onProgramBlockChange(programBlockId: string): void {
    void this.flushPendingSave();
    this.selectedProgramBlockId.set(programBlockId);
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
    this.loadSelectionFromCache(this.workoutDate(), this.trainingDay());
  }

  // ─── Program Block Creation / Editing Modal ───────────────────────────────

  openCreateProgramBlockModal(): void {
    this.modalMode.set('create');
    this.modalEditingBlockId.set('');
    this.modalProgramBlockName.set(buildDefaultNextProgramBlockName(this.programBlockOptions()));
    this.modalProgramBlockTotalWeeks.set(8);
    this.modalMovementTemplates.set({
      'lower-a': '',
      'upper-a': '',
      'lower-b': '',
      'upper-b': '',
    });
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.isProgramBlockModalOpen.set(true);
  }

  openEditProgramBlockModal(): void {
    const definition = this.selectedProgramBlockDefinition();
    this.modalMode.set('edit');
    this.modalEditingBlockId.set(this.selectedProgramBlockId());
    this.modalProgramBlockName.set(definition?.name ?? this.selectedProgramBlockName());
    this.modalProgramBlockTotalWeeks.set(definition?.totalWeeks ?? 8);

    const templates: Record<TrainingDay, string> = {
      'lower-a': '',
      'upper-a': '',
      'lower-b': '',
      'upper-b': '',
    };

    if (definition) {
      for (const day of TRAINING_DAY_ORDER) {
        templates[day] = (definition.templatesByDay[day] ?? [])
          .map((m) => m.movementName)
          .join('\n');
      }
    }

    this.modalMovementTemplates.set(templates);
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.isProgramBlockModalOpen.set(true);
  }

  closeProgramBlockModal(): void {
    if (this.isSavingProgramBlock()) {
      return;
    }

    this.isProgramBlockModalOpen.set(false);
    this.modalErrorMessage.set('');
  }

  onModalTemplateChange(day: TrainingDay, value: string): void {
    this.modalErrorMessage.set('');
    this.modalMovementTemplates.update((existing) => ({
      ...existing,
      [day]: value,
    }));
  }

  async saveProgramBlockFromModal(): Promise<void> {
    const name = this.modalProgramBlockName().trim();
    const totalWeeks = normalizeTotalWeeks(this.modalProgramBlockTotalWeeks());
    const templates = this.modalMovementTemplates();

    if (!name) {
      this.modalErrorMessage.set('Program Block name is required.');
      return;
    }

    const templatesByDay = {
      'lower-a': parseTemplateMovements(templates['lower-a']),
      'upper-a': parseTemplateMovements(templates['upper-a']),
      'lower-b': parseTemplateMovements(templates['lower-b']),
      'upper-b': parseTemplateMovements(templates['upper-b']),
    };

    this.isSavingProgramBlock.set(true);
    this.errorMessage.set('');
    this.modalErrorMessage.set('');

    try {
      const userId = this.requireUserId();
      const isEdit = this.modalMode() === 'edit';
      const blockId = isEdit && this.modalEditingBlockId() ? this.modalEditingBlockId() : crypto.randomUUID();

      const definition = await this.workoutStorage.saveProgramBlockDefinition(userId, {
        id: blockId,
        name,
        totalWeeks,
        templatesByDay: {
          'lower-a': templatesByDay['lower-a'].map((movementName) => ({ movementName })),
          'upper-a': templatesByDay['upper-a'].map((movementName) => ({ movementName })),
          'lower-b': templatesByDay['lower-b'].map((movementName) => ({ movementName })),
          'upper-b': templatesByDay['upper-b'].map((movementName) => ({ movementName })),
        },
      });

      this.programBlockDefinitions.update((existing) => {
        const withoutCurrent = existing.filter((d) => d.id !== definition.id);
        return [definition, ...withoutCurrent];
      });

      this.selectedProgramBlockId.set(definition.id);
      this.isProgramBlockModalOpen.set(false);
      this.saveMessage.set(isEdit ? `Updated ${definition.name}.` : `Created ${definition.name}.`);
      this.copiedFromDate.set('');
      this.copyWeekMessage.set('');
      this.loadSelectionFromCache(this.workoutDate(), this.trainingDay());
    } catch (error: unknown) {
      this.modalErrorMessage.set(error instanceof Error ? error.message : 'Unable to save Program Block.');
    } finally {
      this.isSavingProgramBlock.set(false);
    }
  }

  onSetLoadBlur(movement: DraftMovement, setNumber: number, event?: Event): void {
    const activeSet = movement.setEntries.find((setEntry) => setEntry.setNumber === setNumber);
    if (!activeSet) {
      return;
    }

    const target = event?.target as HTMLInputElement | undefined;
    if (target) {
      const rawVal = target.value.trim();
      if (rawVal === '') {
        activeSet.load = null;
      } else if (movement.keyboardMode === 'text') {
        activeSet.load = rawVal;
      } else {
        const parsed = Number(rawVal);
        activeSet.load = Number.isNaN(parsed) ? rawVal : parsed;
      }
    }

    const nextLoad = activeSet.load;
    if (nextLoad === null) {
      this.scheduleAutoSaveDraft();
      return;
    }

    const hasOtherLoadedSets = movement.setEntries.some(
      (setEntry) => setEntry.setNumber !== setNumber && setEntry.load !== null
    );
    if (hasOtherLoadedSets) {
      this.scheduleAutoSaveDraft();
      return;
    }

    for (const setEntry of movement.setEntries) {
      if (setEntry.setNumber !== setNumber) {
        setEntry.load = nextLoad;
      }
    }
    this.scheduleAutoSaveDraft();
  }

  copyLastWeek(): void {
    const source = this.previousSessionForDay();
    if (!source) {
      this.errorMessage.set(`No previous ${this.trainingDayLabels[this.trainingDay()]} workout found to copy for ${this.currentProgramWeekLabel()}.`);
      return;
    }

    this.blocks = source.blocks.map((block) => ({
      id: crypto.randomUUID(),
      name: block.name,
      movements: block.movements.map((movement) => ({
        id: crypto.randomUUID(),
        movementName: movement.movementName,
        setEntries: movement.setEntries.map((setEntry) => ({
          setNumber: setEntry.setNumber,
          reps: setEntry.reps,
          load: setEntry.load,
        })),
        notes: movement.notes,
        keyboardMode: typeof movement.setEntries[0]?.load === 'string' && Number.isNaN(Number(movement.setEntries[0]?.load)) ? 'text' : 'numeric',
      })),
    }));
    this.workoutNotes.set(source.notes);
    this.copiedFromDate.set(source.date);
    const sourceWeek = source.weekNumber ?? this.weekNumberWithinProgramBlock(source.date, this.selectedProgramBlockStartDate() ?? source.date);
    const targetWeek = this.currentProgramWeek();
    this.copyWeekMessage.set(`Copied Week ${sourceWeek} into Week ${targetWeek}.`);
    this.errorMessage.set('');
    this.scheduleAutoSaveDraft();
  }

  private createBlock(index: number): DraftBlock {
    return {
      id: crypto.randomUUID(),
      name: `Block ${index}`,
      movements: [this.createMovement()],
    };
  }

  private createMovement(movementName = ''): DraftMovement {
    return {
      id: crypto.randomUUID(),
      movementName,
      setEntries: this.createDefaultSetEntries(),
      notes: '',
      keyboardMode: 'numeric',
    };
  }

  private async loadSelection(userId: string, date: string, day: TrainingDay): Promise<void> {
    const loadToken = ++this.loadToken;
    this.isLoading.set(true);

    try {
      const [sessions, definitions] = await Promise.all([
        this.workoutStorage.getSessions(userId),
        this.workoutStorage.getProgramBlockDefinitions(userId),
      ]);
      if (loadToken !== this.loadToken) {
        return;
      }

      this.allSessions.set(sessions);
      this.programBlockDefinitions.set(definitions);
      await this.ensureShareRecipientsLoaded(userId);
      if (loadToken !== this.loadToken) {
        return;
      }

      // An auto-save may have landed (and refreshed allSessions) while we were
      // awaiting above; rebuilding the form from the stale `sessions` snapshot
      // would discard what the user just typed.
      const latestSessions = this.allSessions();
      this.ensureSelectedProgramBlock(latestSessions, definitions, date, day);
      if (!this.pendingSave && !this.saveInFlight) {
        this.loadSelectionFromCache(date, day);
      }
    } finally {
      if (loadToken === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  private resetState(): void {
    this.cancelPendingSave();
    this.lastSavedSignature = '';
    this.isEditingExisting.set(false);
    this.saveMessage.set('');
    this.errorMessage.set('');
    this.workoutNotes.set('');
    this.manualWeekNumber.set(null);
    this.customWeekName.set('');
    this.isManualWeek.set(false);
    this.blocks = [this.createBlock(1)];
    this.selectedProgramBlockId.set(DEFAULT_PROGRAM_BLOCK_ID);
    this.showAllProgramBlockHistory.set(true);
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.allSessions.set([]);
    this.programBlockDefinitions.set([]);
    this.shareRecipients.set([]);
    this.selectedShareRecipientUids.set(new Set());
    this.loadedShareRecipientsForUid = '';
    this.isProgramBlockModalOpen.set(false);
    this.isLoading.set(false);
    this.isDraftRestored.set(false);
  }

  private async reloadSessionsCache(userId: string): Promise<void> {
    const sessions = await this.workoutStorage.getSessions(userId);
    this.allSessions.set(sessions);
    this.ensureSelectedProgramBlock(sessions, this.programBlockDefinitions(), this.workoutDate(), this.trainingDay());
    this.loadSelectionFromCache(this.workoutDate(), this.trainingDay());
  }

  private requireUserId(): string {
    const user = this.authService.user();
    if (!user) {
      throw new Error('You must be signed in.');
    }

    return user.uid;
  }

  private createDefaultSetEntries(): Array<{ setNumber: number; reps: number | null; load: number | string | null }> {
    return Array.from({ length: 2 }, (_value, index) => ({
      setNumber: index + 1,
      reps: null,
      load: null,
    }));
  }

  private ensureSetEntries(
    setEntries: Array<{ setNumber: number; reps: number | null; load: number | string | null }>
  ): Array<{ setNumber: number; reps: number | null; load: number | string | null }> {
    if (setEntries.length > 0) {
      return setEntries.map((setEntry, index) => ({
        ...setEntry,
        setNumber: index + 1,
      }));
    }

    return this.createDefaultSetEntries();
  }

  private ensureSelectedProgramBlock(
    sessions: WorkoutSession[],
    definitions: ProgramBlockDefinition[],
    date: string,
    day: TrainingDay
  ): void {
    const selectedId = this.selectedProgramBlockId();
    if (sessions.some((session) => session.date === date && session.trainingDay === day && session.programBlockId === selectedId)) {
      return;
    }

    const matchingSession = sessions.find((session) => session.date === date && session.trainingDay === day) ?? null;
    if (matchingSession) {
      this.selectedProgramBlockId.set(matchingSession.programBlockId);
      return;
    }

    if (
      definitions.some((definition) => definition.id === selectedId) ||
      sessions.some((session) => session.programBlockId === selectedId)
    ) {
      return;
    }

    const latestSession = sessions
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latestSession) {
      this.selectedProgramBlockId.set(latestSession.programBlockId);
      return;
    }

    if (definitions.length > 0) {
      this.selectedProgramBlockId.set(definitions[0].id);
      return;
    }

    this.selectedProgramBlockId.set(DEFAULT_PROGRAM_BLOCK_ID);
  }

  private loadSelectionFromCache(date: string, day: TrainingDay, forceIgnoreDraft = false): void {
    const user = this.authService.user();
    const existing = this.allSessions().find((session) =>
      session.date === date &&
      session.trainingDay === day &&
      session.programBlockId === this.selectedProgramBlockId()
    ) ?? null;

    // A sessionStorage draft holds edits that may not have reached Firestore yet.
    if (!forceIgnoreDraft && user) {
      const draft = loadWorkoutDraft(user.uid, date, day, this.selectedProgramBlockId());
      if (draft && draft.blocks && draft.blocks.length > 0) {
        this.isEditingExisting.set(!!existing);
        this.lastSavedSession.set(existing);
        this.workoutNotes.set(draft.workoutNotes || '');
        this.isManualWeek.set(draft.weekNumber !== undefined || !!draft.customWeekName);
        this.manualWeekNumber.set(draft.weekNumber ?? null);
        this.customWeekName.set(draft.customWeekName ?? '');
        this.blocks = draft.blocks.map((block) => ({
          id: block.id,
          name: block.name,
          movements: block.movements.map((m) => ({
            id: m.id,
            movementName: m.movementName,
            setEntries: this.ensureSetEntries(m.setEntries),
            notes: m.notes,
            keyboardMode: typeof m.setEntries[0]?.load === 'string' && Number.isNaN(Number(m.setEntries[0]?.load)) ? 'text' : 'numeric',
          })),
        }));

        this.lastSavedSignature = existing ? this.sessionSignature(existing) : '';
        const draftDiffersFromSaved = this.workoutSignature(this.buildSaveInput()) !== this.lastSavedSignature;

        // With auto-save the draft usually matches Firestore exactly; only call
        // it out (and push it up) when it genuinely holds newer edits.
        this.isDraftRestored.set(draftDiffersFromSaved);
        this.saveState.set('idle');
        if (draftDiffersFromSaved) {
          this.scheduleFirestoreSave();
        }
        return;
      }
    }

    this.isDraftRestored.set(false);
    this.cancelPendingSave();

    if (!existing) {
      this.isEditingExisting.set(false);
      this.lastSavedSession.set(null);
      this.lastSavedSignature = '';
      this.workoutNotes.set('');
      this.manualWeekNumber.set(null);
      this.customWeekName.set('');
      this.isManualWeek.set(false);
      this.blocks = this.prefillBlocksFromProgramTemplate(day);
      this.copiedFromDate.set('');
      this.copyWeekMessage.set('');
      return;
    }

    this.isEditingExisting.set(true);
    this.lastSavedSession.set(existing);
    this.lastSavedSignature = this.sessionSignature(existing);
    this.workoutNotes.set(existing.notes);
    this.isManualWeek.set(existing.weekNumber !== undefined || !!existing.customWeekName);
    this.manualWeekNumber.set(existing.weekNumber ?? null);
    this.customWeekName.set(existing.customWeekName ?? '');
    this.blocks = existing.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      movements: block.movements.map((movement) => ({
        id: movement.id,
        movementName: movement.movementName,
        setEntries: this.ensureSetEntries(movement.setEntries).map((setEntry) => ({
          setNumber: setEntry.setNumber,
          reps: setEntry.reps,
          load: setEntry.load,
        })),
        notes: movement.notes,
        keyboardMode: typeof movement.setEntries[0]?.load === 'string' && Number.isNaN(Number(movement.setEntries[0]?.load)) ? 'text' : 'numeric',
      })),
    }));
  }

  private prefillBlocksFromProgramTemplate(day: TrainingDay): DraftBlock[] {
    const definition = this.selectedProgramBlockDefinition();
    if (!definition) {
      return [this.createBlock(1)];
    }

    const dayTemplate = definition.templatesByDay[day];
    if (!dayTemplate || dayTemplate.length === 0) {
      return [this.createBlock(1)];
    }

    return [{
      id: crypto.randomUUID(),
      name: 'Main',
      movements: dayTemplate.map((templateMovement) => this.createMovement(templateMovement.movementName)),
    }];
  }

  private weekNumberWithinProgramBlock(targetDateIso: string, startDateIso: string): number {
    const start = new Date(`${startDateIso}T00:00:00`);
    const target = new Date(`${targetDateIso}T00:00:00`);
    const diffMs = target.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  }

  private async ensureShareRecipientsLoaded(userId: string): Promise<void> {
    if (this.loadedShareRecipientsForUid === userId) {
      return;
    }

    const accepted = await this.socialStorage.getAcceptedFriends(userId);
    const recipientUids = Array.from(
      new Set(accepted.map((request) => this.socialStorage.friendUidFrom(request, userId)))
    );

    const recipients: ShareRecipientOption[] = [];
    for (const uid of recipientUids) {
      const profile = await this.socialStorage.getProfile(uid);
      recipients.push({
        uid,
        displayName: profile?.displayName?.trim() || uid,
      });
    }

    recipients.sort((a, b) => a.displayName.localeCompare(b.displayName));
    this.shareRecipients.set(recipients);

    const stillValidSelected = new Set(
      Array.from(this.selectedShareRecipientUids()).filter((uid) => recipients.some((recipient) => recipient.uid === uid))
    );
    this.selectedShareRecipientUids.set(
      stillValidSelected.size > 0 ? stillValidSelected : new Set(recipients.map((recipient) => recipient.uid))
    );
    this.loadedShareRecipientsForUid = userId;
  }
}

