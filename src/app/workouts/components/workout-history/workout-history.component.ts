import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../auth/services/auth.service';
import { TrainingDay, WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import {
  TRAINING_DAY_LABELS,
  TRAINING_DAY_ORDER,
  WeekGroup,
  groupSessionsByWeek
} from '../../utils/workout-history.utils';

@Component({
  selector: 'app-workout-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workout-history.component.html',
  styleUrl: './workout-history.component.scss',
})
export class WorkoutHistoryComponent {
  readonly weekGroups = signal<WeekGroup[]>([]);
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly dayPageSize = 3;
  readonly trainingDays = TRAINING_DAY_ORDER;
  readonly trainingDayLabels = TRAINING_DAY_LABELS;
  readonly hasWeeks = computed(() => this.weekGroups().length > 0);

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
        void this.router.navigate(['/login'], {
          queryParams: { returnUrl: '/history' },
          replaceUrl: true,
        });
        return;
      }

      void this.loadHistory(user.uid);
    }, { allowSignalWrites: true });
  }

  trackWeek(_index: number, week: WeekGroup): string {
    return week.weekStartDate;
  }

  weekElementId(week: WeekGroup): string {
    return `week-${week.weekStartDate}`;
  }

  latestWeekHref(): string {
    return this.weekGroups()[0] ? `#${this.weekElementId(this.weekGroups()[0])}` : '#';
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

  dayHasSessions(week: WeekGroup, trainingDay: TrainingDay): boolean {
    return this.sessionsForDay(week, trainingDay).length > 0;
  }

  trackSession(_index: number, session: { id: string }): string {
    return session.id;
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

      const nextWeeks = groupSessionsByWeek(sessions, 1);
      this.weekGroups.set(nextWeeks);
      this.clampDayPageState(nextWeeks);
    } catch (error: unknown) {
      if (loadToken !== this.loadToken) {
        return;
      }

      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load history.');
      this.weekGroups.set([]);
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
