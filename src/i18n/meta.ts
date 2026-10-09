// Owner: E
// Translator notes per key (phase2b §6.7 step 1): a description, a max length where the layout needs
// one (chips ≤ 18 chars, buttons ≤ 22, titles ≤ 28) and placeholder notes. The AI-draft prompt carries
// only our English, this file and docs/i18n/glossary.md. F0: the shape; E fills it.
import type { I18nKey } from './en';

export interface KeyMeta {
  readonly description: string;
  /** Soft limit, reported as a warning by the catalogue test. */
  readonly maxLength?: number;
  /** What each {placeholder} holds. */
  readonly placeholders?: Readonly<Record<string, string>>;
  /** false for keys that may equal English in every locale (app.name, boot.progress, numbers, endonyms). */
  readonly translatable?: boolean;
}

export const META: Readonly<Partial<Record<I18nKey, KeyMeta>>> = {};
