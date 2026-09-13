import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@angular/fire/auth';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthService } from '../../../auth/services/auth.service';
import { SocialStorageService } from '../../../social/services/social-storage.service';
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
            getProgramBlockDefinitions: jasmine.createSpy('getProgramBlockDefinitions').and.resolveTo([]),
            getSessionByDateAndDay: jasmine.createSpy('getSessionByDateAndDay').and.resolveTo(null),
            saveSession: jasmine.createSpy('saveSession').and.resolveTo(null),
            saveProgramBlockDefinition: jasmine.createSpy('saveProgramBlockDefinition').and.callFake(async (_userId: string, input: { id: string; name: string; totalWeeks: number; }) => ({
              id: input.id,
              name: input.name,
              totalWeeks: input.totalWeeks,
              templatesByDay: {
                'lower-a': [{ movementName: 'Back squat' }],
                'upper-a': [{ movementName: 'Bench press' }],
                'lower-b': [{ movementName: 'Deadlift' }],
                'upper-b': [{ movementName: 'Pull up' }],
              },
              createdAt: '2026-07-17T00:00:00.000Z',
              updatedAt: '2026-07-17T00:00:00.000Z',
            })),
          },
        },
        {
          provide: SocialStorageService,
          useValue: {
            getProfile: jasmine.createSpy('getProfile').and.resolveTo(null),
            shareWorkout: jasmine.createSpy('shareWorkout').and.resolveTo({}),
            getAcceptedFriends: jasmine.createSpy('getAcceptedFriends').and.resolveTo([]),
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

  it('scopes movement history to all blocks or selected program block based on toggle', () => {
    component.allSessions.set([
      makeSession({
        id: 'same-block',
        date: '2026-07-17',
        trainingDay: 'lower-a',
        programBlockId: 'block-1',
        programBlockName: 'Program Block 1',
      }),
      makeSession({
        id: 'other-block',
        date: '2026-07-10',
        trainingDay: 'lower-a',
        programBlockId: 'block-2',
        programBlockName: 'Program Block 2',
      }),
    ]);

    component.selectedProgramBlockId.set('block-1');
    // By default, showAllProgramBlockHistory is true so movement history follows into future blocks
    expect(component.showAllProgramBlockHistory()).toBeTrue();
    expect(component.movementHistoryFor('Back squat').length).toBe(2);

    component.showAllProgramBlockHistory.set(false);
    expect(component.movementHistoryFor('Back squat').length).toBe(1);
  });

  it('syncs the first load across an empty movement', () => {
    const movement: {
      id: string;
      movementName: string;
      setEntries: Array<{ setNumber: number; reps: number | null; load: number | null }>;
      notes: string;
    } = {
      id: 'move-1',
      movementName: 'Back squat',
      setEntries: [
        { setNumber: 1, reps: null, load: null },
        { setNumber: 2, reps: null, load: null },
      ],
      notes: '',
    };

    movement.setEntries[0].load = 185;
    component.onSetLoadBlur(movement, 1);

    expect(movement.setEntries).toEqual([
      { setNumber: 1, reps: null, load: 185 },
      { setNumber: 2, reps: null, load: 185 },
    ]);
  });

  it('does not copy a partial value while typing; only copies once on blur', () => {
    const movement: {
      id: string;
      movementName: string;
      setEntries: Array<{ setNumber: number; reps: number | null; load: number | null }>;
      notes: string;
    } = {
      id: 'move-1',
      movementName: 'Back squat',
      setEntries: [
        { setNumber: 1, reps: null, load: null },
        { setNumber: 2, reps: null, load: null },
      ],
      notes: '',
    };

    // Simulate keystrokes updating the model without triggering blur.
    movement.setEntries[0].load = 1;
    movement.setEntries[0].load = 15;
    movement.setEntries[0].load = 150;
    expect(movement.setEntries[1].load).toBeNull();

    component.onSetLoadBlur(movement, 1);

    expect(movement.setEntries).toEqual([
      { setNumber: 1, reps: null, load: 150 },
      { setNumber: 2, reps: null, load: 150 },
    ]);
  });

  it('fills the full typed value into other sets via a real DOM blur event, even if the bound model lagged', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

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

    const setRows = fixture.nativeElement.querySelectorAll('.set-row');
    expect(setRows.length).toBe(2);

    const firstLoadInput = setRows[0].querySelectorAll('input')[1] as HTMLInputElement;
    const secondLoadInput = setRows[1].querySelectorAll('input')[1] as HTMLInputElement;
    expect(firstLoadInput).toBeTruthy();
    expect(secondLoadInput).toBeTruthy();

    // Simulate the browser committing the full typed value to the DOM element
    // (even if, for whatever reason, the bound model property lagged behind).
    firstLoadInput.value = '100';
    firstLoadInput.dispatchEvent(new Event('input'));
    firstLoadInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.blocks[0].movements[0].setEntries[1].load).toBe(100);
    expect(secondLoadInput.value).toBe('100');
  });

  it('preserves custom set loads once a movement already has loads', () => {
    const movement: {
      id: string;
      movementName: string;
      setEntries: Array<{ setNumber: number; reps: number | null; load: number | null }>;
      notes: string;
    } = {
      id: 'move-1',
      movementName: 'Back squat',
      setEntries: [
        { setNumber: 1, reps: null, load: null },
        { setNumber: 2, reps: null, load: null },
        { setNumber: 3, reps: null, load: 205 },
      ],
      notes: '',
    };

    movement.setEntries[0].load = 185;
    component.onSetLoadBlur(movement, 1);
    movement.setEntries[1].load = 195;
    component.onSetLoadBlur(movement, 2);

    expect(movement.setEntries).toEqual([
      { setNumber: 1, reps: null, load: 185 },
      { setNumber: 2, reps: null, load: 195 },
      { setNumber: 3, reps: null, load: 205 },
    ]);
  });

  it('creates a new program block from modal input', async () => {
    component.openCreateProgramBlockModal();
    component.modalProgramBlockName.set('Strength Block');
    component.modalProgramBlockTotalWeeks.set(6);
    component.onModalTemplateChange('lower-a', 'Back squat');
    component.onModalTemplateChange('upper-a', 'Bench press');
    component.onModalTemplateChange('lower-b', 'Deadlift');
    component.onModalTemplateChange('upper-b', 'Pull up');

    await component.saveProgramBlockFromModal();

    expect(component.selectedProgramBlockName()).toBe('Strength Block');
    expect(component.currentProgramWeekLabel()).toBe('Week 1 of 6');
    expect(component.isProgramBlockModalOpen()).toBeFalse();
  });

  it('creates a new program block even when templates are blank', async () => {
    component.openCreateProgramBlockModal();
    component.modalProgramBlockName.set('Quick Block');
    component.modalProgramBlockTotalWeeks.set(4);

    await component.saveProgramBlockFromModal();

    expect(component.selectedProgramBlockName()).toBe('Quick Block');
    expect(component.isProgramBlockModalOpen()).toBeFalse();
    expect(component.modalErrorMessage()).toBe('');
  });

  it('allows reordering movements up and down within a block', () => {
    component.blocks = [
      {
        id: 'block-1',
        name: 'Block 1',
        movements: [
          {
            id: 'm1',
            movementName: 'Movement 1',
            setEntries: [{ setNumber: 1, reps: 5, load: 100 }],
            notes: '',
          },
          {
            id: 'm2',
            movementName: 'Movement 2',
            setEntries: [{ setNumber: 1, reps: 5, load: 100 }],
            notes: '',
          },
        ],
      },
    ];

    expect(component.blocks[0].movements[0].movementName).toBe('Movement 1');
    component.moveMovementDown('block-1', 0);
    expect(component.blocks[0].movements[0].movementName).toBe('Movement 2');
    expect(component.blocks[0].movements[1].movementName).toBe('Movement 1');

    component.moveMovementUp('block-1', 1);
    expect(component.blocks[0].movements[0].movementName).toBe('Movement 1');
  });

  it('toggles load input mode between number and text', () => {
    const movement = {
      id: 'm1',
      movementName: 'Pull-up',
      setEntries: [{ setNumber: 1, reps: 8, load: 'BW' }],
      notes: '',
      keyboardMode: 'numeric' as const,
    };

    expect(component.isTextMode(movement)).toBeFalse();
    component.toggleKeyboardMode(movement);
    expect(component.isTextMode(movement)).toBeTrue();
    component.toggleKeyboardMode(movement);
    expect(component.isTextMode(movement)).toBeFalse();
  });

  it('allows manual week number setting and custom week naming', () => {
    component.onManualWeekChange(4);
    expect(component.manualWeekNumber()).toBe(4);

    component.onCustomWeekNameChange('Deload Week');
    expect(component.customWeekName()).toBe('Deload Week');
  });
});

function makeSession(overrides?: {
  id?: string;
  date?: string;
  trainingDay?: 'lower-a' | 'upper-a' | 'lower-b' | 'upper-b';
  movementName?: string;
  blockName?: string;
  notes?: string;
  programBlockId?: string;
  programBlockName?: string;
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
    programBlockId: overrides?.programBlockId ?? 'block-1',
    programBlockName: overrides?.programBlockName ?? 'Program Block 1',
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
