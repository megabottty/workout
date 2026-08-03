import {
  buildDefaultNextProgramBlockName,
  normalizeTotalWeeks,
  parseTemplateMovements,
  normalizeProgramBlock
} from './program-block.utils';

describe('program-block.utils', () => {
  it('normalizes missing block metadata to defaults', () => {
    const normalized = normalizeProgramBlock(undefined, undefined);

    expect(normalized.id).toBe('block-1');
    expect(normalized.name).toBe('Program Block 1');
  });

  it('chooses the next available default block label', () => {
    const name = buildDefaultNextProgramBlockName([
      { id: '1', name: 'Program Block 1' },
      { id: '2', name: 'Program Block 2' },
    ]);

    expect(name).toBe('Program Block 3');
  });

  it('parses template movements from newlines and commas', () => {
    const parsed = parseTemplateMovements('Back squat, Bench press\nDeadlift');

    expect(parsed).toEqual(['Back squat', 'Bench press', 'Deadlift']);
  });

  it('normalizes total weeks to at least one', () => {
    expect(normalizeTotalWeeks(0)).toBe(1);
    expect(normalizeTotalWeeks('4')).toBe(4);
  });
});
