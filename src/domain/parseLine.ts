import type { ItemType } from './types';

export interface ParsedLine {
  type: ItemType;
  /** Line text with the type prefix removed and @/# sigils dropped (names stay as plain words). */
  text: string;
  /** Raw mention tokens, in order of appearance, without the sigil. */
  personMentions: string[];
  projectMentions: string[];
}

// Longest first so "- [ ]" wins over "[]".
const TASK_PREFIXES = [/^-\s*\[\s*\]\s*/, /^\[\s*\]\s*/, /^t:\s*/i, /^todo:\s*/i];
const QUESTION_PREFIXES = [/^\?+\s*/, /^q:\s*/i];

// A sigil only counts at the start or after whitespace/punctuation, so "a@b.com" is not a mention.
const MENTION = /(?<![\p{L}\p{N}])([@#])([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

function stripPrefix(line: string): { type: ItemType; rest: string } {
  for (const re of TASK_PREFIXES) if (re.test(line)) return { type: 'task', rest: line.replace(re, '') };
  for (const re of QUESTION_PREFIXES) if (re.test(line)) return { type: 'question', rest: line.replace(re, '') };
  return { type: 'note', rest: line };
}

export function parseLine(line: string): ParsedLine {
  const { type, rest } = stripPrefix(line.trim());
  const personMentions: string[] = [];
  const projectMentions: string[] = [];

  const text = rest
    .replace(MENTION, (_m, sigil: string, name: string) => {
      // "#12" style references are not project tags.
      if (sigil === '#' && /^\d+$/.test(name)) return `#${name}`;
      (sigil === '@' ? personMentions : projectMentions).push(name);
      return name;
    })
    .trim();

  return { type, text, personMentions, projectMentions };
}
