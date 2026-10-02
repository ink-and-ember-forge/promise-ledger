import { describe, expect, it } from 'vitest';
import { parseLine } from './parseLine';

describe('parseLine type shortcuts', () => {
  it.each([
    ['? who owns the budget', 'question', 'who owns the budget'],
    ['Q: who owns the budget', 'question', 'who owns the budget'],
    ['q:who owns the budget', 'question', 'who owns the budget'],
    ['[] book the room', 'task', 'book the room'],
    ['[ ] book the room', 'task', 'book the room'],
    ['- [ ] book the room', 'task', 'book the room'],
    ['T: book the room', 'task', 'book the room'],
    ['todo: book the room', 'task', 'book the room'],
    ['TODO: book the room', 'task', 'book the room'],
    ['Sam seemed worried about timing', 'note', 'Sam seemed worried about timing'],
  ])('%s -> %s', (line, type, text) => {
    const p = parseLine(line);
    expect(p.type).toBe(type);
    expect(p.text).toBe(text);
  });

  it('does not treat a mid-line question mark or "t:" word as a shortcut', () => {
    expect(parseLine('Was that right?').type).toBe('note');
    expect(parseLine('Next: review').type).toBe('note');
  });

  it('trims surrounding whitespace', () => {
    expect(parseLine('   ? spaced out  ').text).toBe('spaced out');
  });
});

describe('parseLine mentions', () => {
  it('extracts people and projects, keeping names as plain words', () => {
    const p = parseLine('T: ask @Sam to review #Atlas plan');
    expect(p.type).toBe('task');
    expect(p.personMentions).toEqual(['Sam']);
    expect(p.projectMentions).toEqual(['Atlas']);
    expect(p.text).toBe('ask Sam to review Atlas plan');
  });

  it('collects several mentions in order', () => {
    const p = parseLine('@Alex and @Priya on #Atlas and #Beacon');
    expect(p.personMentions).toEqual(['Alex', 'Priya']);
    expect(p.projectMentions).toEqual(['Atlas', 'Beacon']);
  });

  it('supports underscore and hyphen in tags', () => {
    expect(parseLine('see #Release_planning').projectMentions).toEqual(['Release_planning']);
  });

  it('ignores e-mail addresses and numeric references', () => {
    const p = parseLine('mail sam@example.test about issue #12');
    expect(p.personMentions).toEqual([]);
    expect(p.projectMentions).toEqual([]);
    expect(p.text).toBe('mail sam@example.test about issue #12');
  });

  it('handles accented names', () => {
    expect(parseLine('ask @Zoë').personMentions).toEqual(['Zoë']);
  });
});
