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
  WeekGroup,
  groupSessionsByWeek,
} from '../../utils/workout-history.utils';

export interface MovementHistorySessionEntry {
  sessionId: string;
  date: string;
  trainingDay: TrainingDay;
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
  readonly weekGroups = signal<WeekGroup[]>([]);
  readonly allSessions = signal<WorkoutSession[]>([]);
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly dayPageSize = 3;
  readonly trainingDays = TRAINING_DAY_ORDER;
  readonly trainingDayLabels = TRAINING_DAY_LABELS;
  readonly selectedProgramBlockFilter = signal('all');

  // Movement View State
  readonly selectedMovementName = signal('');
  readonly movementSearchQuery = signal('');

  readonly hasWeeks = computed(() => this.filteredWeekGroups().length > 0);

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
    if (selectedFilter === 'all') {
      return this.weekGroups();
    }

    return this.weekGroups()
      .map((week) => ({
        ...week,
        sessions: week.sessions.filter((session) => session.programBlockId === selectedFilter),
      }))
      .filter((week) => week.sessions.length > 0);
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
              programBlockName: session.programBlockName,
              weekNumber: session.weekNumber,
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
        this.weekGroups.set([]);
        void this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      void this.loadHistory(user.uid);
    }, { allowSignalWrites: true });
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

  personalBestFor(movementName: string): PersonalBest | null {
    const normalized = movementName.trim().toLowerCase();
    if (!normalized) return null;
    return this.personalBests().get(normalized) ?? null;
  }

  trackWeek(_index: number, week: WeekGroup): string {
    return week.weekStartDate;
  }

  weekElementId(week: WeekGroup): string {
    return `week-${week.weekStartDate}`;
  }

  latestWeekHref(): string {
    return this.filteredWeekGroups()[0] ? `#${this.weekElementId(this.filteredWeekGroups()[0])}` : '#';
  }

  isWeekExpanded(week: WeekGroup): boolean {
    const key = week.weekStartDate;
    if (!this.weekExpandedState.has(key)) {
      this.weekExpandedState.set(key, true);
    }

    return this.weekExpandedState.get(key) ?? true;
  }

  toggleWeek(week: WeekGroup): void {
    const next = !this.isWeekExpanded(week);
    this.weekExpandedState.set(week.weekStartDate, next);
  }

  selectedDayForWeek(week: WeekGroup): TrainingDay {
    const key = week.weekStartDate;
    if (!this.selectedDayState.has(key)) {
      this.selectedDayState.set(key, this.defaultDayForWeek(week));
    }

    return this.selectedDayState.get(key) ?? this.trainingDays[0];
  }

  selectDay(week: WeekGroup, trainingDay: TrainingDay): void {
    this.selectedDayState.set(week.weekStartDate, trainingDay);
  }

  onProgramBlockFilterChange(nextFilter: string): void {
    this.selectedProgramBlockFilter.set(nextFilter);
  }

  dayHasSessions(week: WeekGroup, trainingDay: TrainingDay): boolean {
    return this.sessionsForDay(week, trainingDay).length > 0;
  }

  trackSession(_index: number, session: { id: string }): string {
    return session.id;
  }

  trackSetNumber(_index: number, item: { setNumber: number }): number {
    return item.setNumber;
  }

  sessionsForDay(week: WeekGroup, trainingDay: TrainingDay): WorkoutSession[] {
    return week.sessions.filter((session) => session.trainingDay === trainingDay);
  }

  selectedDaySessionsForWeek(week: WeekGroup): WorkoutSession[] {
    return this.sessionsForDay(week, this.selectedDayForWeek(week));
  }

  pagedSessionsForDay(week: WeekGroup, trainingDay: TrainingDay): WorkoutSession[] {
    const sessions = this.sessionsForDay(week, trainingDay);
    const page = this.currentDayPage(week, trainingDay);
    const start = (page - 1) * this.dayPageSize;
    return sessions.slice(start, start + this.dayPageSize);
  }

  currentDayPage(week: WeekGroup, trainingDay: TrainingDay): number {
    const key = this.dayPageKey(week, trainingDay);
    const totalPages = this.totalPagesForDay(week, trainingDay);
    const current = this.dayPageState.get(key) ?? 1;
    return Math.min(Math.max(current, 1), totalPages);
  }

  totalPagesForDay(week: WeekGroup, trainingDay: TrainingDay): number {
    return Math.max(1, Math.ceil(this.sessionsForDay(week, trainingDay).length / this.dayPageSize));
  }

  canGoPreviousPage(week: WeekGroup, trainingDay: TrainingDay): boolean {
    return this.currentDayPage(week, trainingDay) > 1;
  }

  canGoNextPage(week: WeekGroup, trainingDay: TrainingDay): boolean {
    return this.currentDayPage(week, trainingDay) < this.totalPagesForDay(week, trainingDay);
  }

  goToPreviousPage(week: WeekGroup, trainingDay: TrainingDay): void {
    this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay) - 1);
  }

  goToNextPage(week: WeekGroup, trainingDay: TrainingDay): void {
    this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay) + 1);
  }

  sessionRangeLabel(week: WeekGroup, trainingDay: TrainingDay): string {
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

      const nextWeeks = groupSessionsByWeek(sessions, 1);
      this.weekGroups.set(nextWeeks);
      this.clampDayPageState(nextWeeks);

      if (!this.selectedMovementName() && this.allMovementNames().length > 0) {
        this.selectedMovementName.set(this.allMovementNames()[0]);
      }
    } catch (error: unknown) {
      if (loadToken !== this.loadToken) {
        return;
      }

      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load history.');
      this.weekGroups.set([]);
      this.allSessions.set([]);
    } finally {
      if (loadToken === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  private dayPageKey(week: WeekGroup, trainingDay: TrainingDay): string {
    return `${week.weekStartDate}:${trainingDay}`;
  }

  private setDayPage(week: WeekGroup, trainingDay: TrainingDay, page: number): void {
    const totalPages = this.totalPagesForDay(week, trainingDay);
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    this.dayPageState.set(this.dayPageKey(week, trainingDay), nextPage);
  }

  private clampDayPageState(weeks: WeekGroup[]): void {
    for (const week of weeks) {
      if (!this.weekExpandedState.has(week.weekStartDate)) {
        this.weekExpandedState.set(week.weekStartDate, true);
      }
      if (!this.selectedDayState.has(week.weekStartDate)) {
        this.selectedDayState.set(week.weekStartDate, this.defaultDayForWeek(week));
      }
      for (const trainingDay of this.trainingDays) {
        this.setDayPage(week, trainingDay, this.currentDayPage(week, trainingDay));
      }
    }
  }

  private defaultDayForWeek(week: WeekGroup): TrainingDay {
    return this.trainingDays.find((trainingDay) => this.dayHasSessions(week, trainingDay)) ?? this.trainingDays[0];
  }
}

