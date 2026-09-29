import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { User } from '@angular/fire/auth';

import { AuthService } from '../../../auth/services/auth.service';
import { TrainingDay, WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import { WorkoutHistoryComponent } from './workout-history.component';
import { BlockWeek } from '../../utils/block-week.utils';

describe('WorkoutHistoryComponent', () => {
  let fixture: ComponentFixture<WorkoutHistoryComponent>;
  let component: WorkoutHistoryComponent;
  let workoutStorage: jasmine.SpyObj<WorkoutStorageService>;

  const sessions: WorkoutSession[] = [
    makeSession('1', '2026-07-21', 'upper-a'),
    makeSession('2', '2026-07-14', 'upper-a'),
    makeSession('3', '2026-07-07', 'upper-a'),
    makeSession('4', '2026-06-30', 'upper-a'),
    makeSession('5', '2026-07-18', 'lower-a'),
  ];

  beforeEach(async () => {
    workoutStorage = jasmine.createSpyObj<WorkoutStorageService>(
      'WorkoutStorageService',
      ['getSessions', 'renameMovementAcrossSessions', 'deleteSession']
    );
    workoutStorage.getSessions.and.resolveTo(sessions);
    workoutStorage.renameMovementAcrossSessions.and.resolveTo(2);
    workoutStorage.deleteSession.and.resolveTo(undefined);

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
          useValue: workoutStorage,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutHistoryComponent);
    component = fixture.componentInstance;
  });

  it('opens a session in the Log form via a deep link when Edit is clicked', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const editButton = fixture.nativeElement.querySelector('.session .btn-edit-session') as HTMLButtonElement;
    expect(editButton).toBeTruthy();
    editButton.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/workouts/log'], {
      queryParams: { date: '2026-07-21', day: 'upper-a', block: jasmine.any(String) },
    });
  });

  it('paginates sessions within a day card', () => {
    const week = makeWeek(sessions);

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

  it('groups history into block weeks that ignore the calendar, newest first', () => {
    component.allSessions.set([
      // Week 1 runs Friday → following Thursday.
      makeSession('w1-la', '2026-09-11', 'lower-a'),
      makeSession('w1-ua', '2026-09-13', 'upper-a'),
      makeSession('w1-lb', '2026-09-15', 'lower-b'),
      makeSession('w1-ub', '2026-09-17', 'upper-b'),
      // Repeating Lower A starts week 2.
      makeSession('w2-la', '2026-09-19', 'lower-a'),
    ]);
    fixture.detectChanges();

    const headers = Array.from(fixture.nativeElement.querySelectorAll('.week-header h2') as NodeListOf<HTMLElement>)
      .map((element) => element.textContent?.replace(/\s+/g, ' ').trim());
    expect(headers[0]).toContain('Program Block 1 · Week 2');
    expect(headers[0]).not.toContain('Complete');
    expect(headers[1]).toContain('Program Block 1 · Week 1');
    expect(headers[1]).toContain('✓ Complete');

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('4 of 4 workouts');
    expect(pageText).toContain('1 of 4 workouts');
    expect(pageText).not.toContain('Week of');
    expect(component.blockWeekNumberFor({ id: 'w2-la' })).toBe(2);
  });

  it('opens a selected day card when a day tile is clicked', () => {
    fixture.detectChanges();
    component.allSessions.set(sessions);
    fixture.detectChanges();

    // Week 3 holds both the 07-14 Upper A and the 07-18 Lower A sessions.
    const weekSection = fixture.nativeElement.querySelector('#week-block-1__3') as HTMLElement;
    expect(weekSection).toBeTruthy();
    const dayButtons = weekSection.querySelectorAll('.day-card--selector') as NodeListOf<HTMLButtonElement>;
    dayButtons[0].click();
    fixture.detectChanges();

    const pageText = weekSection.textContent as string;
    expect(pageText).toContain('Lower Day A');
    expect(pageText).toContain('2026-07-18');
  });

  it('filters rendered sessions by selected program block', () => {
    component.allSessions.set([
      makeSession('1', '2026-07-21', 'upper-a', 'block-1', 'Program Block 1'),
      makeSession('2', '2026-07-20', 'upper-a', 'block-2', 'Program Block 2'),
    ]);
    component.onProgramBlockFilterChange('block-2');
    const week = component.filteredWeekGroups()[0];
    component.selectDay(week, 'upper-a');
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('2026-07-20');
    expect(pageText).toContain('Program Block 2');
    expect(pageText).not.toContain('2026-07-21');
  });

  it('flags workouts that share a date, training day and program block as duplicates', () => {
    component.allSessions.set([
      makeSession('2026-07-21', '2026-07-21', 'upper-a'),
      makeSession('2026-07-21__upper-a__block-1', '2026-07-21', 'upper-a'),
      makeSession('other', '2026-07-22', 'lower-a'),
    ]);
    fixture.detectChanges();

    expect(component.isDuplicate({ id: '2026-07-21' })).toBeTrue();
    expect(component.isDuplicate({ id: '2026-07-21__upper-a__block-1' })).toBeTrue();
    expect(component.isDuplicate({ id: 'other' })).toBeFalse();
    expect((fixture.nativeElement.textContent as string)).toContain('Duplicate');
  });

  it('deletes a workout from a session card after confirmation and reloads', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    workoutStorage.getSessions.calls.reset();

    const deleteButton = fixture.nativeElement.querySelector('.session .btn-delete-session') as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();
    deleteButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(workoutStorage.deleteSession).toHaveBeenCalledWith('user-1', '1');
    expect(workoutStorage.getSessions).toHaveBeenCalled();
    expect(component.actionMessage()).toContain('Deleted');
  });

  it('does not delete when the confirmation is dismissed', async () => {
    spyOn(window, 'confirm').and.returnValue(false);

    await component.deleteSession({ id: '1', date: '2026-07-21', trainingDay: 'upper-a' });

    expect(workoutStorage.deleteSession).not.toHaveBeenCalled();
  });

  it('supports toggling view mode and searching movement history', () => {
    const sessionWithMovements: WorkoutSession = {
      id: 's-m',
      date: '2026-07-20',
      trainingDay: 'lower-a',
      programBlockId: 'block-1',
      programBlockName: 'Block 1',
      notes: '',
      blocks: [
        {
          id: 'b1',
          name: 'Main',
          movements: [
            {
              id: 'm1',
              movementName: 'Front Squat',
              setEntries: [{ setNumber: 1, reps: 5, load: '225' }],
              notes: 'Clean grip',
            },
            {
              id: 'm2',
              movementName: 'Romanian Deadlift',
              setEntries: [{ setNumber: 1, reps: 8, load: '275' }],
              notes: '',
            },
          ],
        },
      ],
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    };

    component.allSessions.set([sessionWithMovements]);
    component.setViewMode('by-movement');
    fixture.detectChanges();

    expect(component.viewMode()).toBe('by-movement');
    expect(component.allMovementNames()).toContain('Front Squat');
    expect(component.allMovementNames()).toContain('Romanian Deadlift');

    component.movementSearchQuery.set('Front');
    expect(component.filteredMovementOptions()).toEqual(['Front Squat']);

    component.selectMovement('Front Squat');
    expect(component.selectedMovementName()).toBe('Front Squat');
    expect(component.selectedMovementHistory().length).toBe(1);
    expect(component.selectedMovementPB()?.maxLoad).toBe(225);
  });

  it('supports manually selecting unrelated movement names to combine', async () => {
    component.allSessions.set([
      makeSessionWithMovements(['DB RDL', 'Dumbbell Romanian Deadlift', 'Front Squat']),
    ]);
    component.openConsolidationModal();

    component.toggleManualMovement('DB RDL', true);
    component.toggleManualMovement('Dumbbell Romanian Deadlift', true);

    expect(component.manualSelectedNames()).toEqual(['DB RDL', 'Dumbbell Romanian Deadlift']);
    expect(component.manualCanonicalName()).toBe('DB RDL');
    expect(component.canMergeManualSelection()).toBeTrue();

    spyOn(window, 'confirm').and.returnValue(true);
    await component.mergeManualSelection();

    expect(workoutStorage.renameMovementAcrossSessions).toHaveBeenCalledWith(
      'user-1',
      ['DB RDL', 'Dumbbell Romanian Deadlift'],
      'DB RDL'
    );
    expect(component.manualSelectedNames()).toEqual([]);
  });

  it('keeps the manual movement manager available when there are no automatic suggestions', () => {
    component.allSessions.set([
      makeSessionWithMovements(['Back Squat', 'Bench Press']),
    ]);
    component.setViewMode('by-movement');
    fixture.detectChanges();

    const manageButton = fixture.nativeElement.querySelector('.btn-consolidate') as HTMLButtonElement | null;
    expect(component.hasMovementNameClusters()).toBeFalse();
    expect(manageButton?.textContent).toContain('Manage movement names');
  });

  it('clears stale manual selections after an automatic merge', async () => {
    component.allSessions.set([
      makeSessionWithMovements(['Bench Press', 'Bench Pres', 'Front Squat']),
    ]);
    component.openConsolidationModal();
    component.toggleManualMovement('Bench Pres', true);
    component.toggleManualMovement('Front Squat', true);

    spyOn(window, 'confirm').and.returnValue(true);
    await component.mergeCluster(component.movementNameClusters()[0]);

    expect(component.manualSelectedNames()).toEqual([]);
    expect(component.manualCanonicalName()).toBe('');
  });
});

function makeSession(
  id: string,
  date: string,
  trainingDay: TrainingDay,
  programBlockId = 'block-1',
  programBlockName = 'Program Block 1'
): WorkoutSession {
  return {
    id,
    date,
    trainingDay,
    programBlockId,
    programBlockName,
    notes: '',
    blocks: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

function makeWeek(weekSessions: WorkoutSession[]): BlockWeek {
  return {
    key: 'block-1__1',
    programBlockId: 'block-1',
    programBlockName: 'Program Block 1',
    weekNumber: 1,
    sessions: weekSessions.slice().sort((a, b) => b.date.localeCompare(a.date)),
    startDate: weekSessions[weekSessions.length - 1]?.date ?? '',
    endDate: weekSessions[0]?.date ?? '',
    completedDays: ['upper-a', 'lower-a'],
    isComplete: false,
  };
}

function makeSessionWithMovements(movementNames: string[]): WorkoutSession {
  return {
    ...makeSession('manual', '2026-07-22', 'lower-a'),
    blocks: [
      {
        id: 'block',
        name: 'Main',
        movements: movementNames.map((movementName, index) => ({
          id: `movement-${index}`,
          movementName,
          setEntries: [],
          notes: '',
        })),
      },
    ],
  };
}
