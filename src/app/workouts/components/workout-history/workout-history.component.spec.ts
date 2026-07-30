import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { User } from '@angular/fire/auth';

import { AuthService } from '../../../auth/services/auth.service';
import { TrainingDay, WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import { WorkoutHistoryComponent } from './workout-history.component';

describe('WorkoutHistoryComponent', () => {
  let fixture: ComponentFixture<WorkoutHistoryComponent>;
  let component: WorkoutHistoryComponent;

  const sessions: WorkoutSession[] = [
    makeSession('1', '2026-07-21', 'upper-a'),
    makeSession('2', '2026-07-14', 'upper-a'),
    makeSession('3', '2026-07-07', 'upper-a'),
    makeSession('4', '2026-06-30', 'upper-a'),
    makeSession('5', '2026-07-18', 'lower-a'),
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule, WorkoutHistoryComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'user-1' } as User),
          },
        },
        {
          provide: WorkoutStorageService,
          useValue: {
            getSessions: jasmine.createSpy('getSessions').and.resolveTo(sessions),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutHistoryComponent);
    component = fixture.componentInstance;
  });

  it('paginates sessions within a day card', () => {
    const week = {
      weekStartDate: '2026-07-20',
      weekLabel: 'Week of Jul 20, 2026',
      sessions,
    };

    component.weekGroups.set([week]);

    expect(component.totalPagesForDay(week, 'upper-a')).toBe(2);
    expect(component.pagedSessionsForDay(week, 'upper-a').map((session) => session.date)).toEqual([
      '2026-07-21',
      '2026-07-14',
      '2026-07-07',
    ]);

    component.goToNextPage(week, 'upper-a');

    expect(component.currentDayPage(week, 'upper-a')).toBe(2);
    expect(component.pagedSessionsForDay(week, 'upper-a').map((session) => session.date)).toEqual([
      '2026-06-30',
    ]);
  });

  it('renders the current page of sessions in the day card', () => {
    const week = {
      weekStartDate: '2026-07-20',
      weekLabel: 'Week of Jul 20, 2026',
      sessions,
    };

    component.weekGroups.set([week]);
    component.selectDay(week, 'upper-a');
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Page 1 / 2');
    expect(pageText).toContain('2026-07-21');
    expect(pageText).toContain('2026-07-14');
    expect(pageText).toContain('2026-07-07');
    expect(pageText).not.toContain('2026-06-30');
  });

  it('opens a selected day card when a day tile is clicked', () => {
    const week = {
      weekStartDate: '2026-07-20',
      weekLabel: 'Week of Jul 20, 2026',
      sessions,
    };

    fixture.detectChanges();
    component.weekGroups.set([week]);
    fixture.detectChanges();

    const dayButtons = fixture.nativeElement.querySelectorAll('.day-card--selector') as NodeListOf<HTMLButtonElement>;
    dayButtons[0].click();
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Lower Day A');
    expect(pageText).toContain('2026-07-18');
  });
});

function makeSession(id: string, date: string, trainingDay: TrainingDay): WorkoutSession {
  return {
    id,
    date,
    trainingDay,
    notes: '',
    blocks: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}
