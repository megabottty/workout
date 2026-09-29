import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { SetEntry, TrainingDay, WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import {
  PersonalBest,
  calculateMovementPersonalBests,
  isNewPersonalRecord,
} from '../../utils/personal-best.utils';
import {
  TRAINING_DAY_LABELS,
  TRAINING_DAY_ORDER,
  formatFriendlyDate,
} from '../../utils/workout-history.utils';
import { BlockWeek, assignBlockWeeks } from '../../utils/block-week.utils';
import {
  MovementNameCluster,
  clusterSimilarMovementNames,
} from '../../utils/movement-similarity.utils';

export interface MovementHistorySessionEntry {
  sessionId: string;
  date: string;
  trainingDay: TrainingDay;
  programBlockId: string;
  programBlockName: string;
  weekNumber?: number;
  customWeekName?: string;
  blockName: string;
  setEntries: SetEntry[];
  notes: string;
  sessionNotes: string;
}

@Component({
  selector: 'app-workout-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workout-history.component.html',
  styleUrl: './workout-history.component.scss',
})
export class WorkoutHistoryComponent {
  readonly viewMode = signal<'by-workout' | 'by-movement'>('by-workout');
  readonly allSessions = signal<WorkoutSession[]>([]);
  readonly deletingSessionId = signal('');
  readonly actionMessage = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly dayPageSize = 3;
  readonly trainingDays = TRAINING_DAY_ORDER;
  readonly trainingDayLabels = TRAINING_DAY_LABELS;
  readonly selectedProgramBlockFilter = signal('all');

  // Movement View State
  readonly selectedMovementName = signal('');
  readonly movementSearchQuery = signal('');

  // Movement consolidation ("did you mean X?") state
  readonly showConsolidationModal = signal(false);
  readonly consolidationSelections = signal<Record<string, string>>({});
  readonly isConsolidating = signal(false);
  readonly consolidationMessage = signal('');
  readonly consolidationError = signal('');
  readonly manualMovementSearchQuery = signal('');
  readonly manualSelectedNames = signal<string[]>([]);
  readonly manualCanonicalName = signal('');

  readonly hasWeeks = computed(() => this.filteredWeekGroups().length > 0);

  /** Block weeks (one pass through the four training days), newest first. */
  readonly blockWeeks = computed(() => assignBlockWeeks(this.allSessions()));

  /** Sessions that share date + training day + program block with another one (e.g. left behind by an older id scheme). */
  readonly duplicateSessionIds = computed(() => {
    const seen = new Map<string, string[]>();
    for (const session of this.allSessions()) {
      const key = `${session.date}|${session.trainingDay}|${session.programBlockId}`;
      seen.set(key, [...(seen.get(key) ?? []), session.id]);
    }
    const duplicates = new Set<string>();
    for (const ids of seen.values()) {
      if (ids.length > 1) {
        ids.forEach((id) => duplicates.add(id));
      }
    }
    return duplicates;
  });

  readonly programBlockOptions = computed(() => {
    const blocks = new Map<string, string>();
    for (const session of this.allSessions()) {
      if (!blocks.has(session.programBlockId)) {
        blocks.set(session.programBlockId, session.programBlockName);
      }
    }

    return Array.from(blocks.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly filteredWeekGroups = computed(() => {
    const selectedFilter = this.selectedProgramBlockFilter();
    const weeks = this.blockWeeks().weeks;
    if (selectedFilter === 'all') {
      return weeks;
    }
    return weeks.filter((week) => week.programBlockId === selectedFilter);
  });

  readonly allMovementNames = computed(() => {
    const names = new Set<string>();
    for (const session of this.allSessions()) {
      for (const block of session.blocks) {
        for (const movement of block.movements) {
          const trimmed = movement.movementName.trim();
          if (trimmed) {
            names.add(trimmed);
          }
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  });

  readonly movementNameClusters = computed<MovementNameCluster[]>(() =>
    clusterSimilarMovementNames(this.allMovementNames())
  );

  readonly hasMovementNameClusters = computed(() => this.movementNameClusters().length > 0);

  readonly filteredManualMovementNames = computed(() => {
    const query = this.manualMovementSearchQuery().trim().toLowerCase();
    if (!query) return this.allMovementNames();
    return this.allMovementNames().filter((name) => name.toLowerCase().includes(query));
  });

  readonly canMergeManualSelection = computed(() => {
    const selectedNames = this.manualSelectedNames();
    return selectedNames.length >= 2 && selectedNames.includes(this.manualCanonicalName());
  });

  readonly filteredMovementOptions = computed(() => {
    const query = this.movementSearchQuery().trim().toLowerCase();
    const all = this.allMovementNames();
    if (!query) return all;
    return all.filter((name) => name.toLowerCase().includes(query));
  });

  readonly personalBests = computed(() =>
    calculateMovementPersonalBests(this.allSessions())
  );

  readonly selectedMovementPB = computed(() => {
    const selected = this.selectedMovementName().trim().toLowerCase();
    if (!selected) return null;
    return this.personalBests().get(selected) ?? null;
  });

  readonly selectedMovementHistory = computed<MovementHistorySessionEntry[]>(() => {
    const selected = this.selectedMovementName().trim().toLowerCase();
    if (!selected) return [];

    const history: MovementHistorySessionEntry[] = [];
    const sessions = this.allSessions().slice().sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      if (this.selectedProgramBlockFilter() !== 'all' && session.programBlockId !== this.selectedProgramBlockFilter()) {
        continue;
      }

      for (const block of session.blocks) {
        for (const movement of block.movements) {
          if (movement.movementName.trim().toLowerCase() === selected) {
            history.push({
              sessionId: session.id,
              date: session.date,
              trainingDay: session.trainingDay,
              programBlockId: session.programBlockId,
              programBlockName: session.programBlockName,
              weekNumber: this.blockWeekNumberFor(session) ?? undefined,
              customWeekName: session.customWeekName,
              blockName: block.name,
              setEntries: movement.setEntries,
              notes: movement.notes,
              sessionNotes: session.notes,
            });
          }
        }
      }
    }

    return history;
  });

  private readonly dayPageState = new Map<string, number>();
  private readonly weekExpandedState = new Map<string, boolean>();
  private readonly selectedDayState = new Map<string, TrainingDay>();
  private loadToken = 0;

  constructor(
    private readonly workoutStorage: WorkoutStorageService,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    effect(() => {
      const user = this.authService.user();
      if (!user) {
        this.allSessions.set([]);
        void this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      void this.loadHistory(user.uid);
    }, { allowSignalWrites: true });
  }

  blockWeekNumberFor(session: { id: string }): number | null {
    return this.blockWeeks().weekBySessionId.get(session.id)?.weekNumber ?? null;
  }

  isDuplicate(session: { id: string }): boolean {
    return this.duplicateSessionIds().has(session.id);
  }

  /** "Fri, Sep 11, 2026 – Thu, Sep 17, 2026 · 3 of 4 workouts" */
  weekSubtitle(week: BlockWeek): string {
    const range = week.startDate === week.endDate
      ? formatFriendlyDate(week.startDate, true)
      : `${formatFriendlyDate(week.startDate, true)} – ${formatFriendlyDate(week.endDate, true)}`;
    return `${range} · ${week.completedDays.length} of ${this.trainingDays.length} workouts`;
  }

  /** Deletes one workout after confirmation and reloads. */
  async deleteSession(session: { id: string; date: string; trainingDay: TrainingDay }): Promise<void> {
    const user = this.authService.user();
    if (!user || this.deletingSessionId()) {
      return;
    }

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(
          `Delete the ${TRAINING_DAY_LABELS[session.trainingDay]} workout from ${formatFriendlyDate(session.date, true)}? ` +
            'This cannot be undone.'
        );
    if (!confirmed) {
      return;
    }

    this.deletingSessionId.set(session.id);
    this.errorMessage.set('');
    this.actionMessage.set('');

    try {
      await this.workoutStorage.deleteSession(user.uid, session.id);
      this.actionMessage.set(`Deleted the workout from ${formatFriendlyDate(session.date, true)}.`);
      await this.loadHistory(user.uid);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete workout.');
    } finally {
      this.deletingSessionId.set('');
    }
  }

  /** Opens the given workout in the Log form via a deep link. */
  editSession(session: { date: string; trainingDay: TrainingDay; programBlockId: string }): void {
    void this.router.navigate(['/workouts/log'], {
      queryParams: {
        date: session.date,
        day: session.trainingDay,
        block: session.programBlockId,
      },
    });
  }

  setViewMode(mode: 'by-workout' | 'by-movement'): void {
    this.viewMode.set(mode);
    if (mode === 'by-movement' && !this.selectedMovementName() && this.allMovementNames().length > 0) {
      this.selectedMovementName.set(this.allMovementNames()[0]);
    }
  }

  selectMovement(name: string): void {
    this.selectedMovementName.set(name);
  }

  openConsolidationModal(): void {
    const defaults: Record<string, string> = {};
    for (const cluster of this.movementNameClusters()) {
      defaults[this.clusterKey(cluster)] = cluster.suggestedCanonicalName;
    }
    this.consolidationSelections.set(defaults);
    this.consolidationMessage.set('');
    this.consolidationError.set('');
    this.manualMovementSearchQuery.set('');
    this.manualSelectedNames.set([]);
    this.manualCanonicalName.set('');
    this.showConsolidationModal.set(true);
  }

  closeConsolidationModal(): void {
    this.showConsolidationModal.set(false);
  }

  clusterKey(cluster: MovementNameCluster): string {
    return cluster.names.join('||');
  }

  canonicalNameFor(cluster: MovementNameCluster): string {
    return this.consolidationSelections()[this.clusterKey(cluster)] ?? cluster.suggestedCanonicalName;
  }

  setCanonicalNameFor(cluster: MovementNameCluster, name: string): void {
    this.consolidationSelections.update((current) => ({
      ...current,
      [this.clusterKey(cluster)]: name,
    }));
  }

  isManualMovementSelected(name: string): boolean {
    return this.manualSelectedNames().includes(name);
  }

  toggleManualMovement(name: string, selected: boolean): void {
    const current = this.manualSelectedNames();
    const next = selected
      ? Array.from(new Set([...current, name]))
      : current.filter((selectedName) => selectedName !== name);

    this.manualSelectedNames.set(next);
    if (!next.includes(this.manualCanonicalName())) {
      this.manualCanonicalName.set(next[0] ?? '');
    }
  }

  async mergeManualSelection(): Promise<void> {
    const selectedNames = this.manualSelectedNames();
    const canonicalName = this.manualCanonicalName().trim();
    if (selectedNames.length < 2 || !selectedNames.includes(canonicalName)) {
      this.consolidationError.set('Select at least two movement names and choose which name to keep.');
      return;
    }

    const merged = await this.mergeMovementNames(selectedNames, canonicalName);
    if (merged) {
      this.manualMovementSearchQuery.set('');
      this.manualSelectedNames.set([]);
      this.manualCanonicalName.set('');
    }
  }

  async mergeCluster(cluster: MovementNameCluster): Promise<void> {
    const canonicalName = this.canonicalNameFor(cluster).trim();
    if (!canonicalName) {
      this.consolidationError.set('Please choose a name to merge into.');
      return;
    }

    await this.mergeMovementNames(cluster.names, canonicalName);
  }

  private async mergeMovementNames(names: readonly string[], canonicalName: string): Promise<boolean> {
    const user = this.authService.user();
    if (!user) return false;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(
          `Combine ${names.length} movement names (${names.join(', ')}) into "${canonicalName}"? ` +
            'This will rename these movements across all of your past workouts and cannot be undone.'
        );
    if (!confirmed) {
      return false;
    }

    this.isConsolidating.set(true);
    this.consolidationError.set('');
    this.consolidationMessage.set('');

    try {
      const updatedCount = await this.workoutStorage.renameMovementAcrossSessions(
        user.uid,
        names,
        canonicalName
      );
      this.consolidationMessage.set(
        updatedCount > 0
          ? `Combined into "${canonicalName}" — updated ${updatedCount} workout${updatedCount === 1 ? '' : 's'}.`
          : `Everything selected already uses "${canonicalName}"; no workouts needed updating.`
      );
      await this.loadHistory(user.uid);
      this.manualMovementSearchQuery.set('');
      this.manualSelectedNames.set([]);
      this.manualCanonicalName.set('');
      if (this.selectedMovementName() && names.some((name) => name.toLowerCase() === this.selectedMovementName().toLowerCase())) {
        this.selectedMovementName.set(canonicalName);
      }
      return true;
    } catch (error: unknown) {
      this.consolidationError.set(error instanceof Error ? error.message : 'Unable to merge movements.');
      return false;
    } finally {
      this.isConsolidating.set(false);
    }
  }

  personalBestFor(movementName: string): PersonalBest | null {
    const normalized = movementName.trim().toLowerCase();
    if (!normalized) return null;
    return this.personalBests().get(normalized) ?? null;
  }

  trackWeek(_index: number, week: BlockWeek): string {
    return week.key;
  }

  weekElementId(week: BlockWeek): string {
    return `week-${week.key}`;
  }

  latestWeekHref(): string {
    return this.filteredWeekGroups()[0] ? `#${this.weekElementId(this.filteredWeekGroups()[0])}` : '#';
  }

  isWeekExpanded(week: BlockWeek): boolean {
    const key = week.key;
    if (!this.weekExpandedState.has(key)) {
      this.weekExpandedState.set(key, true);
    }

    return this.weekExpandedState.get(key) ?? true;
  }

  toggleWeek(week: BlockWeek): void {
    const next = !this.isWeekExpanded(week);
    this.weekExpandedState.set(week.key, next);
  }

  selectedDayForWeek(week: BlockWeek): TrainingDay {
    const key = week.key;
    if (!this.selectedDayState.has(key)) {
      this.selectedDayState.set(key, this.defaultDayForWeek(week));
    }

    return this.selectedDayState.get(key) ?? this.trainingDays[0];
  }

  selectDay(week: BlockWeek, trainingDay: TrainingDay): void {
    this.selectedDayState.set(week.key, trainingDay);
  }

  onProgramBlockFilterChange(nextFilter: string): void {
    this.selectedProgramBlockFilter.set(nextFilter);
  }

  dayHasSessions(week: BlockWeek, trainingDay: TrainingDay): boolean {
    return this.sessionsForDay(week, trainingDay).length > 0;
  }

  trackSession(_index: number, session: { id: string }): string {
    return session.id;
  }

  trackSetNumber(_index: number, item: { setNumber: number }): number {
    return item.setNumber;
  }

  sessionsForDay(week: BlockWeek, trainingDay: TrainingDay): WorkoutSession[] {
    return week.sessions.filter((session) => session.trainingDay === trainingDay);
  }

  selectedDaySessionsForWeek(week: BlockWeek): WorkoutSession[] {
    return this.sessionsForDay(week, this.selectedDayForWeek(week));
  }

  pagedSessionsForDay(week: BlockWeek, trainingDay: TrainingDay): WorkoutSession[] {
    const sessions = this.sessionsForDay(week, trainingDay);
    const page = this.currentDayPage(week, trainingDay);
    const start = (page - 1) * this.dayPageSize;
    return sessions.slice(start, start + this.dayPageSize);
  }

  currentDayPage(week: BlockWeek, trainingDay: TrainingDay): number {
    const key = this.dayPageKey(week, trainingDay);
    const totalPages = this.totalPagesForDay(week, trainingDay);
    const current = this.dayPageState.get(key) ?? 1;
    return Math.min(Math.max(current, 1), totalPages);
  }

  totalPagesForDay(week: BlockWeek, trainingDay: TrainingDay): number {
    return Math.max(1, Math.ceil(this.sessionsForDay(week, trainingDay).length / this.dayPageSize));
  }

  canGoPreviousPage(week: BlockWeek, trainingDay: TrainingDay): boolean {
    return this.currentDayPage(week, trainingDay) > 1;
  }

  canGoNextPage(week: BlockWeek, trainingDay: TrainingDay): boolean {
    return this.currentDayPage(week, trainingDay) < this.totalPagesForDay(week, trainingDay);
  }

  goToPreviousPage(week: BlockWeek, trainingDay: TrainingDay): void {
    this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay) - 1);
  }

  goToNextPage(week: BlockWeek, trainingDay: TrainingDay): void {
    this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay) + 1);
  }

  sessionRangeLabel(week: BlockWeek, trainingDay: TrainingDay): string {
    const total = this.sessionsForDay(week, trainingDay).length;
    if (total === 0) {
      return '0 sessions';
    }

    const page = this.currentDayPage(week, trainingDay);
    const start = (page - 1) * this.dayPageSize + 1;
    const end = Math.min(page * this.dayPageSize, total);
    return `${start}-${end} of ${total}`;
  }

  private async loadHistory(userId: string): Promise<void> {
    const loadToken = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const sessions = await this.workoutStorage.getSessions(userId);
      if (loadToken !== this.loadToken) {
        return;
      }

      this.allSessions.set(sessions);
      if (
        this.selectedProgramBlockFilter() !== 'all' &&
        !sessions.some((session) => session.programBlockId === this.selectedProgramBlockFilter())
      ) {
        this.selectedProgramBlockFilter.set('all');
      }

      this.clampDayPageState(this.blockWeeks().weeks);

      if (!this.selectedMovementName() && this.allMovementNames().length > 0) {
        this.selectedMovementName.set(this.allMovementNames()[0]);
      }
    } catch (error: unknown) {
      if (loadToken !== this.loadToken) {
        return;
      }

      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load history.');
      this.allSessions.set([]);
    } finally {
      if (loadToken === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  private dayPageKey(week: BlockWeek, trainingDay: TrainingDay): string {
    return `${week.key}:${trainingDay}`;
  }

  private setDayPage(week: BlockWeek, trainingDay: TrainingDay, page: number): void {
    const totalPages = this.totalPagesForDay(week, trainingDay);
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    this.dayPageState.set(this.dayPageKey(week, trainingDay), nextPage);
  }

  private clampDayPageState(weeks: BlockWeek[]): void {
    for (const week of weeks) {
      if (!this.weekExpandedState.has(week.key)) {
        this.weekExpandedState.set(week.key, true);
      }
      if (!this.selectedDayState.has(week.key)) {
        this.selectedDayState.set(week.key, this.defaultDayForWeek(week));
      }
      for (const trainingDay of this.trainingDays) {
        this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay));
      }
    }
  }

  private defaultDayForWeek(week: BlockWeek): TrainingDay {
    return this.trainingDays.find((trainingDay) => this.dayHasSessions(week, trainingDay)) ?? this.trainingDays[0];
  }
}
