import {
  parseNumericLoad,
  formatLoadDisplay,
  calculateMovementPersonalBests,
  isNewPersonalRecord,
} from './personal-best.utils';
import { WorkoutSession } from '../models/workout.models';

describe('personal-best.utils', () => {
  describe('parseNumericLoad', () => {
    it('returns null for null, undefined, or empty strings', () => {
      expect(parseNumericLoad(null)).toBeNull();
      expect(parseNumericLoad(undefined)).toBeNull();
      expect(parseNumericLoad('')).toBeNull();
      expect(parseNumericLoad('   ')).toBeNull();
    });

    it('parses numbers and numeric strings directly', () => {
      expect(parseNumericLoad(135)).toBe(135);
      expect(parseNumericLoad(225.5)).toBe(225.5);
      expect(parseNumericLoad('185')).toBe(185);
      expect(parseNumericLoad('185.5 lbs')).toBe(185.5);
    });

    it('parses bodyweight load additions like BW+25', () => {
      expect(parseNumericLoad('BW+25')).toBe(25);
      expect(parseNumericLoad('BW + 35.5')).toBe(35.5);
      expect(parseNumericLoad('Bodyweight + 10')).toBe(10);
    });

    it('returns null for plain non-numeric strings', () => {
      expect(parseNumericLoad('BW')).toBeNull();
      expect(parseNumericLoad('bodyweight')).toBeNull();
      expect(parseNumericLoad('red band')).toBeNull();
    });
  });

  describe('formatLoadDisplay', () => {
    it('formats loads into display strings properly', () => {
      expect(formatLoadDisplay(null)).toBe('');
      expect(formatLoadDisplay(undefined)).toBe('');
      expect(formatLoadDisplay(135)).toBe('135');
      expect(formatLoadDisplay('BW+25')).toBe('BW+25');
    });
  });

  describe('calculateMovementPersonalBests', () => {
    it('computes highest load and reps per movement across sessions', () => {
      const mockSessions: WorkoutSession[] = [
        {
          id: 's1',
          date: '2026-07-01',
          trainingDay: 'lower-a',
          programBlockId: 'b1',
          programBlockName: 'Block 1',
          notes: '',
          blocks: [
            {
              id: 'blk-1',
              name: 'Compound',
              movements: [
                {
                  id: 'm1',
                  movementName: 'Back Squat',
                  setEntries: [
                    { setNumber: 1, reps: 5, load: 185 },
                    { setNumber: 2, reps: 5, load: 225 },
                  ],
                  notes: '',
                },
              ],
            },
          ],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 's2',
          date: '2026-07-08',
          trainingDay: 'lower-a',
          programBlockId: 'b1',
          programBlockName: 'Block 1',
          notes: '',
          blocks: [
            {
              id: 'blk-1',
              name: 'Compound',
              movements: [
                {
                  id: 'm1',
                  movementName: 'Back Squat',
                  setEntries: [
                    { setNumber: 1, reps: 3, load: 245 },
                  ],
                  notes: '',
                },
              ],
            },
          ],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ];

      const pbs = calculateMovementPersonalBests(mockSessions);
      const squatPb = pbs.get('back squat');
      expect(squatPb).toBeDefined();
      expect(squatPb?.maxLoad).toBe(245);
      expect(squatPb?.reps).toBe(3);
      expect(squatPb?.date).toBe('2026-07-08');
    });
  });

  describe('isNewPersonalRecord', () => {
    it('returns true if no personal best exists and load > 0', () => {
      expect(isNewPersonalRecord(135, 5, null)).toBeTrue();
      expect(isNewPersonalRecord('BW+10', 5, null)).toBeTrue();
      expect(isNewPersonalRecord(null, 5, null)).toBeFalse();
    });

    it('returns true when current load exceeds personal best load', () => {
      const pb = {
        movementName: 'Bench Press',
        maxLoad: 185,
        reps: 5,
        loadDisplay: '185',
        date: '2026-07-01',
        trainingDay: 'upper-a' as const,
        blockName: 'Primary',
      };

      expect(isNewPersonalRecord(190, 5, pb)).toBeTrue();
      expect(isNewPersonalRecord(180, 5, pb)).toBeFalse();
    });

    it('returns true when load matches PB but reps exceed previous PB', () => {
      const pb = {
        movementName: 'Bench Press',
        maxLoad: 185,
        reps: 5,
        loadDisplay: '185',
        date: '2026-07-01',
        trainingDay: 'upper-a' as const,
        blockName: 'Primary',
      };

      expect(isNewPersonalRecord(185, 6, pb)).toBeTrue();
      expect(isNewPersonalRecord(185, 5, pb)).toBeFalse();
      expect(isNewPersonalRecord(185, 4, pb)).toBeFalse();
    });
  });
});
