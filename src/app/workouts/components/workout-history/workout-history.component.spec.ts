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
      ['getSessions', 'renameMovementAcrossSessions']
    );
    workoutStorage.getSessions.and.resolveTo(sessions);
    workoutStorage.renameMovementAcrossSessions.and.resolveTo(2);

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

  it('filters rendered sessions by selected program block', () => {
    const week = {
      weekStartDate: '2026-07-20',
      weekLabel: 'Week of Jul 20, 2026',
      sessions: [
        makeSession('1', '2026-07-21', 'upper-a', 'block-1', 'Program Block 1'),
        makeSession('2', '2026-07-20', 'upper-a', 'block-2', 'Program Block 2'),
      ],
    };

    component.weekGroups.set([week]);
    component.allSessions.set(week.sessions);
    component.onProgramBlockFilterChange('block-2');
    component.selectDay(week, 'upper-a');
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('2026-07-20');
    expect(pageText).toContain('Program Block 2');
    expect(pageText).not.toContain('2026-07-21');
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
