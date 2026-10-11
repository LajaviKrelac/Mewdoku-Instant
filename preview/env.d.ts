// Owner: lead (preview link, 2026-10-11). The preview build's own build-time value (vite.config.ts, mode
// 'preview-link' only): when and from which commit the page was built, shown in the preview menu so the owner can
// tell at a glance that the link carries the latest build. Read through `typeof` (absent in tests).
declare const __PREVIEW_BUILD__: { readonly at: string; readonly sha: string | null; readonly version: string } | undefined;
