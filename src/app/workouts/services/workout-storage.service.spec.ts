import { Firestore } from '@angular/fire/firestore';

import { WorkoutStorageService } from './workout-storage.service';

describe('WorkoutStorageService program block compatibility', () => {
  let service: WorkoutStorageService;

  beforeEach(() => {
    service = new WorkoutStorageService({} as Firestore);
  });

  it('assigns default program block metadata for legacy sessions', () => {
    const normalized = (service as unknown as {
      normalizeSession: (value: unknown) => {
        programBlockId: string;
        programBlockName: string;
      };
    }).normalizeSession({
      id: 'session-1',
      date: '2026-07-20',
      trainingDay: 'lower-a',
      notes: '',
      blocks: [],
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });

    expect(normalized.programBlockId).toBe('block-1');
    expect(normalized.programBlockName).toBe('Program Block 1');
  });

  it('preserves program block metadata when present', () => {
    const normalized = (service as unknown as {
      normalizeSession: (value: unknown) => {
        programBlockId: string;
        programBlockName: string;
      };
    }).normalizeSession({
      id: 'session-2',
      date: '2026-07-27',
      trainingDay: 'upper-a',
      programBlockId: 'hypertrophy-1',
      programBlockName: 'Hypertrophy Block',
      notes: '',
      blocks: [],
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    });

    expect(normalized.programBlockId).toBe('hypertrophy-1');
    expect(normalized.programBlockName).toBe('Hypertrophy Block');
  });

  it('normalizes program block definition templates by training day', () => {
    const normalized = (service as unknown as {
      normalizeProgramBlockDefinition: (value: unknown) => {
        totalWeeks: number;
        templatesByDay: Record<string, Array<{ movementName: string }>>;
      };
    }).normalizeProgramBlockDefinition({
      id: 'block-99',
      name: 'Cycle',
      totalWeeks: 5,
      templatesByDay: {
        'lower-a': [{ movementName: 'Back squat' }],
      },
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });

    expect(normalized.totalWeeks).toBe(5);
    expect(normalized.templatesByDay['lower-a'][0].movementName).toBe('Back squat');
    expect(normalized.templatesByDay['upper-a'].length).toBe(0);
  });
});
