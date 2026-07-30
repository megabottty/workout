import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@angular/fire/auth';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthService } from '../../../auth/services/auth.service';
import { WorkoutSession } from '../../models/workout.models';
import { WorkoutStorageService } from '../../services/workout-storage.service';
import { WorkoutLogComponent } from './workout-log.component';

describe('WorkoutLogComponent', () => {
  let fixture: ComponentFixture<WorkoutLogComponent>;
  let component: WorkoutLogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkoutLogComponent, RouterTestingModule],
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
            getSessions: jasmine.createSpy('getSessions').and.resolveTo([makeSession()]),
            getSessionByDateAndDay: jasmine.createSpy('getSessionByDateAndDay').and.resolveTo(null),
            saveSession: jasmine.createSpy('saveSession').and.resolveTo(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutLogComponent);
    component = fixture.componentInstance;
  });

  it('shows the last-week movement reference beside a matching movement', async () => {
    component.workoutDate.set('2026-07-24');
    component.trainingDay.set('lower-a');

    fixture.detectChanges();
    await fixture.whenStable();

    component.allSessions.set([makeSession()]);
    component.blocks = [
      {
        id: 'block-1',
        name: 'Block 1',
        movements: [
          {
            id: 'move-1',
            movementName: 'Back squat',
            setEntries: [
              { setNumber: 1, reps: null, load: null },
              { setNumber: 2, reps: null, load: null },
            ],
            notes: '',
          },
        ],
      },
    ];

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Last week');
    expect(text).toContain('Back squat');
    expect(text).toContain('2026-07-17');
  });

  it('returns full movement history for dropdown-selected names', () => {
    component.allSessions.set([
      makeSession(),
      makeSession({
        id: 'older',
        date: '2026-07-10',
        trainingDay: 'upper-a',
        blockName: 'Accessory',
        notes: 'Paused reps',
      }),
      makeSession({
        id: 'different-movement',
        date: '2026-07-03',
        trainingDay: 'lower-b',
        movementName: 'Romanian deadlift',
      }),
    ]);

    const history = component.movementHistoryFor('Back squat');

    expect(history.length).toBe(2);
    expect(history.map((entry) => entry.sessionDate)).toEqual(['2026-07-17', '2026-07-10']);
    expect(history[0].trainingDay).toBe('lower-a');
    expect(history[1].trainingDay).toBe('upper-a');
  });

  it('autofills empty sibling set loads and preserves edited set loads', () => {
    const movement = {
      id: 'move-1',
      movementName: 'Back squat',
      setEntries: [
        { setNumber: 1, reps: null, load: null },
        { setNumber: 2, reps: null, load: null },
        { setNumber: 3, reps: null, load: 205 },
      ],
      notes: '',
    };

    component.onSetLoadChange(movement, 1, 185);

    expect(movement.setEntries).toEqual([
      { setNumber: 1, reps: null, load: 185 },
      { setNumber: 2, reps: null, load: 185 },
      { setNumber: 3, reps: null, load: 205 },
    ]);
  });
});

function makeSession(overrides?: {
  id?: string;
  date?: string;
  trainingDay?: 'lower-a' | 'upper-a' | 'lower-b' | 'upper-b';
  movementName?: string;
  blockName?: string;
  notes?: string;
}): WorkoutSession {
  const date = overrides?.date ?? '2026-07-17';
  const trainingDay = overrides?.trainingDay ?? 'lower-a';
  const movementName = overrides?.movementName ?? 'Back squat';
  const blockName = overrides?.blockName ?? 'Main';
  const notes = overrides?.notes ?? 'Keep braced';

  return {
    id: overrides?.id ?? 'prev',
    date,
    trainingDay,
    notes: '',
    blocks: [
      {
        id: 'block-1',
        name: blockName,
        movements: [
          {
            id: 'move-1',
            movementName,
            setEntries: [
              { setNumber: 1, reps: 5, load: 185 },
              { setNumber: 2, reps: 5, load: 185 },
            ],
            notes,
          },
        ],
      },
    ],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}
