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

  it('normalizes string loads and week metadata correctly', () => {
    const normalized = (service as unknown as {
      normalizeSession: (value: unknown) => {
        weekNumber?: number;
        customWeekName?: string;
        blocks: Array<{
          movements: Array<{
            setEntries: Array<{ load: number | string | null }>;
          }>;
        }>;
      };
    }).normalizeSession({
      id: 'session-3',
      date: '2026-07-27',
      trainingDay: 'upper-a',
      weekNumber: 2,
      customWeekName: 'Intro Week',
      notes: '',
      blocks: [
        {
          id: 'b1',
          name: 'Main',
          movements: [
            {
              id: 'm1',
              movementName: 'Pull-up',
              setEntries: [
                { setNumber: 1, reps: 8, load: 'BW+25' },
                { setNumber: 2, reps: 10, load: 50 },
                { setNumber: 3, reps: 12, load: '  ' },
              ],
              notes: '',
            },
          ],
        },
      ],
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    });

    expect(normalized.weekNumber).toBe(2);
    expect(normalized.customWeekName).toBe('Intro Week');
    expect(normalized.blocks[0].movements[0].setEntries[0].load).toBe('BW+25');
    expect(normalized.blocks[0].movements[0].setEntries[1].load).toBe(50);
    expect(normalized.blocks[0].movements[0].setEntries[2].load).toBeNull();
  });
});
