import {
  clusterSimilarMovementNames,
  findLikelyDuplicateMovementName,
  normalizeMovementName,
  similarityRatio,
} from './movement-similarity.utils';

describe('movement-similarity.utils', () => {
  describe('normalizeMovementName', () => {
    it('trims, lowercases, and collapses whitespace', () => {
      expect(normalizeMovementName('  Bench   Press  ')).toBe('bench press');
    });
  });

  describe('similarityRatio', () => {
    it('returns 1 for identical (normalized) strings', () => {
      expect(similarityRatio('Bench Press', 'bench press')).toBe(1);
    });

    it('returns a lower ratio for very different strings', () => {
      expect(similarityRatio('Bench Press', 'Deadlift')).toBeLessThan(0.5);
    });
  });

  describe('findLikelyDuplicateMovementName', () => {
    it('finds a close typo match', () => {
      const result = findLikelyDuplicateMovementName('Bench Pres', ['Bench Press', 'Deadlift']);
      expect(result).toBe('Bench Press');
    });

    it('returns null when the name already exists exactly (normalized)', () => {
      const result = findLikelyDuplicateMovementName('bench press', ['Bench Press']);
      expect(result).toBeNull();
    });

    it('returns null when there is no close match', () => {
      const result = findLikelyDuplicateMovementName('Overhead Press', ['Deadlift', 'Squat']);
      expect(result).toBeNull();
    });

    it('ignores very short names to avoid false positives', () => {
      const result = findLikelyDuplicateMovementName('Row', ['Bow', 'Low']);
      expect(result).toBeNull();
    });
  });

  describe('clusterSimilarMovementNames', () => {
    it('groups exact-normalized duplicates together', () => {
      const clusters = clusterSimilarMovementNames(['Bench Press', 'bench press', 'Deadlift']);
      expect(clusters.length).toBe(1);
      expect(clusters[0].names.sort()).toEqual(['Bench Press', 'bench press'].sort());
    });

    it('groups close typos together', () => {
      const clusters = clusterSimilarMovementNames(['Bench Press', 'Bench Pres']);
      expect(clusters.length).toBe(1);
      expect(clusters[0].names).toContain('Bench Press');
      expect(clusters[0].names).toContain('Bench Pres');
    });

    it('does not group unrelated movement names', () => {
      const clusters = clusterSimilarMovementNames(['Bench Press', 'Deadlift', 'Squat']);
      expect(clusters.length).toBe(0);
    });
  });
});
