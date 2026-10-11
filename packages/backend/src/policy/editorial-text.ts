import { ValidationAppError } from '../errors/index.js';

// Deterministic screening is a minimum publication guard. Staff moderation
// remains responsible for context and claims this bounded rule cannot detect.
const PROHIBITED =
  /moisture|water[\s-]*content|\bhmf\b|diastase|purity|lab[\s-]*(?:tested|verified|report|result)|therapeut|medic|\bcures?\b|\btreat(?:s|ment|ing)?\b|prevent.{0,30}(?:disease|illness)|antibacter|antimicrob|immun|detox|weight[\s-]*loss|allergy[\s-]*relief|wound[\s-]*heal|درمان|شفا|رطوبت|آزمایشگاه|تقویت\s*(?:ایمنی|سیستم\s*ایمنی)|ضد\s*(?:باکتری|میکروب)|سم\s*زدایی|کاهش\s*وزن|پیشگیری\s*از\s*(?:بیماری|سرطان)/iu;

export function editorialText(input: unknown, maximum: number, path: string): string {
  if (typeof input !== 'string') throw new ValidationAppError([{ path, code: 'TEXT_INVALID' }]);
  const text = input.normalize('NFC').trim();
  if (
    text.length < 1 ||
    Array.from(text).length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff\u202a-\u202e\u2066-\u2069]/u.test(
      text,
    )
  )
    throw new ValidationAppError([{ path, code: 'TEXT_INVALID' }]);
  return text;
}

export function assertEditorialPublication(text: string): void {
  if (PROHIBITED.test(text))
    throw new ValidationAppError([{ path: 'text', code: 'CONTENT_POLICY_REJECTED' }]);
}
