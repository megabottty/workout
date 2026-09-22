/**
 * Utilities for detecting likely-duplicate movement names (e.g. "Bench Press"
 * vs "bench press " vs "Bench  Press") so we can prompt the user to
 * consolidate them instead of silently fragmenting history/PBs.
 */

/** Normalizes a movement name for comparison: trims, collapses whitespace, lowercases. */
export function normalizeMovementName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Returns whether a stored movement should be rewritten during a merge.
 * Matching uses normalized names so source variants are found, but the
 * canonical name is compared exactly so casing/spacing variants still get
 * cleaned up.
 */
export function shouldRenameMovementName(
  movementName: string,
  fromNames: readonly string[],
  canonicalName: string
): boolean {
  const trimmedCanonicalName = canonicalName.trim();
  if (!trimmedCanonicalName || movementName === trimmedCanonicalName) {
    return false;
  }

  const normalizedSources = new Set(fromNames.map((name) => normalizeMovementName(name)));
  return normalizedSources.has(normalizeMovementName(movementName));
}

/** Levenshtein edit distance between two strings. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1, // deletion
        distances[i][j - 1] + 1, // insertion
        distances[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

/**
 * Returns a similarity ratio in [0, 1], where 1 means identical (after
 * normalization) and 0 means completely different.
 */
export function similarityRatio(a: string, b: string): number {
  const normalizedA = normalizeMovementName(a);
  const normalizedB = normalizeMovementName(b);
  if (normalizedA === normalizedB) return 1;

  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / maxLength;
}

/** Minimum similarity ratio to consider two *different-looking* names as likely duplicates. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.82;
/** Minimum length for either name before we bother flagging a near-duplicate (avoids noisy short-name false positives). */
const MIN_NAME_LENGTH_FOR_FUZZY_MATCH = 4;

/**
 * Given a candidate movement name and a list of existing/known movement
 * names, returns the closest existing name that looks like a likely
 * duplicate (but is not already an exact normalized match), or null if none.
 */
export function findLikelyDuplicateMovementName(
  candidateName: string,
  existingNames: readonly string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): string | null {
  const normalizedCandidate = normalizeMovementName(candidateName);
  if (!normalizedCandidate) return null;

  let bestMatch: string | null = null;
  let bestRatio = threshold;

  for (const existingName of existingNames) {
    const normalizedExisting = normalizeMovementName(existingName);
    if (!normalizedExisting || normalizedExisting === normalizedCandidate) {
      continue; // exact match already merges naturally; nothing to prompt for
    }
    if (
      normalizedCandidate.length < MIN_NAME_LENGTH_FOR_FUZZY_MATCH ||
      normalizedExisting.length < MIN_NAME_LENGTH_FOR_FUZZY_MATCH
    ) {
      continue;
    }

    const ratio = similarityRatio(normalizedCandidate, normalizedExisting);
    if (ratio >= bestRatio) {
      bestRatio = ratio;
      bestMatch = existingName;
    }
  }

  return bestMatch;
}

export interface MovementNameCluster {
  /** Canonical suggestion: the most common/longest original-cased spelling seen for this cluster. */
  suggestedCanonicalName: string;
  /** All distinct original-cased names that were grouped into this cluster. */
  names: string[];
}

/**
 * Groups a list of distinct movement names into clusters of likely
 * duplicates based on normalized-string similarity. Only clusters with more
 * than one distinct name are considered "duplicate groups" needing review.
 */
export function clusterSimilarMovementNames(
  names: readonly string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): MovementNameCluster[] {
  const distinctNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

  // First, group exact normalized matches together (different casing/whitespace of the same word).
  const exactGroups = new Map<string, string[]>();
  for (const name of distinctNames) {
    const key = normalizeMovementName(name);
    const group = exactGroups.get(key) ?? [];
    group.push(name);
    exactGroups.set(key, group);
  }

  const groupEntries = Array.from(exactGroups.entries());
  const visited = new Set<string>();
  const clusters: MovementNameCluster[] = [];

  for (let i = 0; i < groupEntries.length; i++) {
    const [keyA, namesA] = groupEntries[i];
    if (visited.has(keyA)) continue;
    visited.add(keyA);

    const clusterNames = [...namesA];
    for (let j = i + 1; j < groupEntries.length; j++) {
      const [keyB, namesB] = groupEntries[j];
      if (visited.has(keyB)) continue;
      if (
        keyA.length >= MIN_NAME_LENGTH_FOR_FUZZY_MATCH &&
        keyB.length >= MIN_NAME_LENGTH_FOR_FUZZY_MATCH &&
        similarityRatio(keyA, keyB) >= threshold
      ) {
        clusterNames.push(...namesB);
        visited.add(keyB);
      }
    }

    if (clusterNames.length > 1) {
      clusters.push({
        suggestedCanonicalName: pickSuggestedCanonicalName(clusterNames),
        names: clusterNames,
      });
    }
  }

  return clusters;
}

function pickSuggestedCanonicalName(names: string[]): string {
  // Prefer the name that appears most "title-cased"/longest as a reasonable default; fall back to the first.
  return names
    .slice()
    .sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
}
