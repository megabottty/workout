export const DEFAULT_PROGRAM_BLOCK_ID = 'block-1';
export const DEFAULT_PROGRAM_BLOCK_NAME = 'Program Block 1';

export type ProgramBlockOption = {
  id: string;
  name: string;
};

export function normalizeProgramBlock(
  programBlockId: unknown,
  programBlockName: unknown
): ProgramBlockOption {
  const normalizedId = typeof programBlockId === 'string' ? programBlockId.trim() : '';
  const normalizedName = typeof programBlockName === 'string' ? programBlockName.trim() : '';

  if (normalizedId.length > 0) {
    return {
      id: normalizedId,
      name: normalizedName || DEFAULT_PROGRAM_BLOCK_NAME,
    };
  }

  return {
    id: DEFAULT_PROGRAM_BLOCK_ID,
    name: normalizedName || DEFAULT_PROGRAM_BLOCK_NAME,
  };
}

export function buildDefaultNextProgramBlockName(existingBlocks: ProgramBlockOption[]): string {
  const usedNames = new Set(existingBlocks.map((block) => block.name.trim().toLowerCase()));
  let candidateNumber = 1;

  while (usedNames.has(`program block ${candidateNumber}`)) {
    candidateNumber += 1;
  }

  return `Program Block ${candidateNumber}`;
}

export function parseTemplateMovements(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((movement) => movement.trim())
    .filter((movement) => movement.length > 0);
}

export function normalizeTotalWeeks(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }

  return 1;
}
