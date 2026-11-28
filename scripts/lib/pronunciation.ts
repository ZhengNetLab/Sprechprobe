// How TTS should say words it would otherwise get wrong, mainly German
// abbreviations that eleven_v4 reads with English letter names (VWL → "vee
// double-you el"). scripts/pronunciation.json maps the word as written in the
// scene to what is sent to TTS; the app still shows the written form.
// Matching is case-sensitive and on whole words only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dictionary = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'pronunciation.json'), 'utf8'),
) as Record<string, string>;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (w: string): RegExp => new RegExp(`(?<!\\p{L})${escape(w)}(?!\\p{L})`, 'gu');
const rules = Object.entries(dictionary)
  .sort(([a], [b]) => b.length - a.length)
  .map(([word, say]) => [wholeWord(word), say] as const);

/** The text sent to TTS for a line. */
export function spoken(text: string): string {
  let out = text;
  for (const [re, say] of rules) out = out.replace(re, say);
  return out;
}

/** All-caps words (2+ letters) that have no entry yet: TTS may spell them in English. */
export function unlistedAbbreviations(text: string): string[] {
  const found = text.match(/(?<!\p{L})\p{Lu}{2,}(?!\p{L})/gu) ?? [];
  return [...new Set(found.filter((w) => !(w in dictionary)))];
}
