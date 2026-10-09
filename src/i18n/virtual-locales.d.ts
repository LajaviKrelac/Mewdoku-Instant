// Owner: lead (phase2b F0). Types of the build-generated module scripts/locale-loaders.ts serves.
declare module 'virtual:mewdoku-locales' {
  /** 'en' plus the bundled locales with a catalogue file, in i18n.locales order. */
  export const BUILD_LOCALES: readonly import('../app/config').LocaleId[];
  /** One dynamic import per bundled non-English locale. */
  export const LOCALE_LOADERS: Readonly<Partial<Record<import('../app/config').LocaleId, () => Promise<import('./build-locales').LocaleModule>>>>;
}
