import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { ProgramBlockDefinition, TrainingDay, WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import {
  DEFAULT_PROGRAM_BLOCK_ID,
  DEFAULT_PROGRAM_BLOCK_NAME,
  ProgramBlockOption,
  buildDefaultNextProgramBlockName,
  normalizeTotalWeeks,
  parseTemplateMovements,
} from '../../utils/program-block.utils';
import { TRAINING_DAY_LABELS, TRAINING_DAY_ORDER } from '../../utils/workout-history.utils';

type DraftMovement = {
  id: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | null;
  }>;
  notes: string;
};

type DraftBlock = {
  id: string;
  name: string;
  movements: DraftMovement[];
};

type MovementReference = {
  sourceDate: string;
  blockName: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | null;
  }>;
  notes: string;
};

type MovementHistoryEntry = {
  sessionId: string;
  sessionDate: string;
  trainingDay: TrainingDay;
  blockName: string;
  movementName: string;
  setEntries: Array<{
    setNumber: number;
    reps: number | null;
    load: number | null;
  }>;
  notes: string;
};

@Component({
  selector: 'app-workout-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workout-log.component.html',
  styleUrl: './workout-log.component.scss',
})
export class WorkoutLogComponent {
  readonly workoutDate = signal(new Date().toISOString().slice(0, 10));
  readonly trainingDay = signal<TrainingDay>('lower-a');
  readonly selectedProgramBlockId = signal(DEFAULT_PROGRAM_BLOCK_ID);
  readonly showAllProgramBlockHistory = signal(false);
  readonly workoutNotes = signal('');
  blocks: DraftBlock[] = [this.createBlock(1)];

  readonly saveMessage = signal('');
  readonly isEditingExisting = signal(false);
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly copiedFromDate = signal('');
  readonly copyWeekMessage = signal('');
  readonly allSessions = signal<WorkoutSession[]>([]);
  readonly programBlockDefinitions = signal<ProgramBlockDefinition[]>([]);

  readonly isProgramBlockModalOpen = signal(false);
  readonly isCreatingProgramBlock = signal(false);
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

  readonly currentProgramWeek = computed(() => {
    const startDate = this.selectedProgramBlockStartDate();
    if (!startDate) {
      return 1;
    }

    return this.weekNumberWithinProgramBlock(this.workoutDate(), startDate);
  });

  readonly currentProgramWeekLabel = computed(() => {
    const definition = this.selectedProgramBlockDefinition();
    if (!definition) {
      return `Week ${this.currentProgramWeek()}`;
    }

    const currentWeek = this.currentProgramWeek();
    return `Week ${Math.min(currentWeek, definition.totalWeeks)} of ${definition.totalWeeks}`;
  });

  readonly sessionsForMovementHistory = computed(() => {
    if (this.showAllProgramBlockHistory()) {
      return this.allSessions();
    }

    return this.sessionsForSelectedProgramBlock();
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
    for (const session of this.sessionsForMovementHistory()) {
      for (const block of session.blocks) {
        for (const movement of block.movements) {
          const name = movement.movementName.trim();
          if (name.length > 0) {
            names.add(name);
          }
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  });

  readonly movementHistoryByName = computed(() => {
    const history = new Map<string, MovementHistoryEntry[]>();
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

          const existing = history.get(normalized) ?? [];
          existing.push({
            sessionId: session.id,
            sessionDate: session.date,
            trainingDay: session.trainingDay,
            blockName: block.name,
            movementName: movement.movementName,
            setEntries: movement.setEntries.map((setEntry) => ({
              setNumber: setEntry.setNumber,
              reps: setEntry.reps,
              load: setEntry.load,
            })),
            notes: movement.notes,
          });
          history.set(normalized, existing);
        }
      }
    }

    return history;
  });

  readonly trainingDayOptions = TRAINING_DAY_ORDER.map((value) => ({
    value,
    label: TRAINING_DAY_LABELS[value],
  }));
  readonly trainingDayLabels = TRAINING_DAY_LABELS;

  private loadToken = 0;

  constructor(
    private readonly workoutStorage: WorkoutStorageService,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    effect(() => {
      const user = this.authService.user();
      const date = this.workoutDate();
      const day = this.trainingDay();

      if (!user) {
        this.resetState();
        void this.router.navigate(['/login'], {
          queryParams: { returnUrl: '/workouts/log' },
          replaceUrl: true,
        });
        return;
      }

      void this.loadSelection(user.uid, date, day);
    }, { allowSignalWrites: true });
  }

  addBlock(): void {
    this.blocks.push(this.createBlock(this.blocks.length + 1));
  }

  removeBlock(blockId: string): void {
    if (this.blocks.length === 1) {
      return;
    }

    this.blocks = this.blocks.filter((block) => block.id !== blockId);
  }

  addMovement(blockId: string): void {
    const block = this.blocks.find((candidate) => candidate.id === blockId);
    if (!block) {
      return;
    }

    block.movements.push(this.createMovement());
  }

  removeMovement(blockId: string, movementId: string): void {
    const block = this.blocks.find((candidate) => candidate.id === blockId);
    if (!block || block.movements.length === 1) {
      return;
    }

    block.movements = block.movements.filter((movement) => movement.id !== movementId);
  }

  addSet(movement: DraftMovement): void {
    const defaultLoad = movement.setEntries.find((setEntry) => setEntry.load !== null)?.load ?? null;
    movement.setEntries.push({
      setNumber: movement.setEntries.length + 1,
      reps: null,
      load: defaultLoad,
    });
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
  }

  async saveWorkout(): Promise<void> {
    const wasEditingExisting = this.isEditingExisting();
    this.errorMessage.set('');

    try {
      const userId = this.requireUserId();
      await this.workoutStorage.saveSession(userId, {
        date: this.workoutDate(),
        trainingDay: this.trainingDay(),
        programBlockId: this.selectedProgramBlockId(),
        programBlockName: this.selectedProgramBlockName(),
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
      });

      this.isEditingExisting.set(true);
      this.saveMessage.set(`${wasEditingExisting ? 'Updated' : 'Saved'} workout for ${this.workoutDate()}.`);
      await this.reloadSessionsCache(userId);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to save workout.');
    }
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
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
    this.saveMessage.set('');
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
  }

  onTrainingDayChange(): void {
    this.saveMessage.set('');
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
  }

  onProgramBlockChange(programBlockId: string): void {
    this.selectedProgramBlockId.set(programBlockId);
    this.saveMessage.set('');
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.errorMessage.set('');
    this.loadSelectionFromCache(this.workoutDate(), this.trainingDay());
  }

  openProgramBlockModal(): void {
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

  closeProgramBlockModal(): void {
    if (this.isCreatingProgramBlock()) {
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

  async createProgramBlockFromModal(): Promise<void> {
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

    this.isCreatingProgramBlock.set(true);
    this.errorMessage.set('');
    this.modalErrorMessage.set('');

    try {
      const userId = this.requireUserId();
      const blockId = crypto.randomUUID();
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

      this.programBlockDefinitions.update((existing) => [definition, ...existing]);
      this.selectedProgramBlockId.set(definition.id);
      this.showAllProgramBlockHistory.set(false);
      this.isProgramBlockModalOpen.set(false);
      this.saveMessage.set(`Started ${definition.name}. You are on Week 1 of ${definition.totalWeeks}.`);
      this.copiedFromDate.set('');
      this.copyWeekMessage.set('');
      this.loadSelectionFromCache(this.workoutDate(), this.trainingDay());
    } catch (error: unknown) {
      this.modalErrorMessage.set(error instanceof Error ? error.message : 'Unable to create Program Block.');
    } finally {
      this.isCreatingProgramBlock.set(false);
    }
  }

  onSetLoadChange(movement: DraftMovement, setNumber: number, value: unknown): void {
    const nextLoad = this.normalizeFormNumber(value);
    const activeSet = movement.setEntries.find((setEntry) => setEntry.setNumber === setNumber);
    if (!activeSet) {
      return;
    }

    activeSet.load = nextLoad;
    if (nextLoad === null) {
      return;
    }

    for (const setEntry of movement.setEntries) {
      if (setEntry.setNumber !== setNumber && setEntry.load === null) {
        setEntry.load = nextLoad;
      }
    }
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
      })),
    }));
    this.workoutNotes.set(source.notes);
    this.copiedFromDate.set(source.date);
    const sourceWeek = this.weekNumberWithinProgramBlock(source.date, this.selectedProgramBlockStartDate() ?? source.date);
    const targetWeek = this.currentProgramWeek();
    this.copyWeekMessage.set(`Copied Week ${sourceWeek} into Week ${targetWeek}.`);
    this.errorMessage.set('');
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
      this.ensureSelectedProgramBlock(sessions, definitions, date, day);
      this.loadSelectionFromCache(date, day);
    } finally {
      if (loadToken === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  private resetState(): void {
    this.isEditingExisting.set(false);
    this.saveMessage.set('');
    this.errorMessage.set('');
    this.workoutNotes.set('');
    this.blocks = [this.createBlock(1)];
    this.selectedProgramBlockId.set(DEFAULT_PROGRAM_BLOCK_ID);
    this.showAllProgramBlockHistory.set(false);
    this.copiedFromDate.set('');
    this.copyWeekMessage.set('');
    this.allSessions.set([]);
    this.programBlockDefinitions.set([]);
    this.isProgramBlockModalOpen.set(false);
    this.isLoading.set(false);
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

  private createDefaultSetEntries(): Array<{ setNumber: number; reps: number | null; load: number | null }> {
    return Array.from({ length: 2 }, (_value, index) => ({
      setNumber: index + 1,
      reps: null,
      load: null,
    }));
  }

  private ensureSetEntries(
    setEntries: Array<{ setNumber: number; reps: number | null; load: number | null }>
  ): Array<{ setNumber: number; reps: number | null; load: number | null }> {
    if (setEntries.length > 0) {
      return setEntries.map((setEntry, index) => ({
        ...setEntry,
        setNumber: index + 1,
      }));
    }

    return this.createDefaultSetEntries();
  }

  private normalizeFormNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
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

  private loadSelectionFromCache(date: string, day: TrainingDay): void {
    const existing = this.allSessions().find((session) =>
      session.date === date &&
      session.trainingDay === day &&
      session.programBlockId === this.selectedProgramBlockId()
    ) ?? null;

    if (!existing) {
      this.isEditingExisting.set(false);
      this.workoutNotes.set('');
      this.blocks = this.prefillBlocksFromProgramTemplate(day);
      this.copiedFromDate.set('');
      this.copyWeekMessage.set('');
      return;
    }

    this.isEditingExisting.set(true);
    this.workoutNotes.set(existing.notes);
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
}
