/**
 * Shared admin-auth constants — was three separate hardcoded copies (scripts/
 * create-admin.ts, app/api/admin/change-password/route.ts,
 * components/admin/SettingsContent.tsx), all requiring the same value but with no
 * single source of truth, so a future change to one could silently drift from the
 * other two (matching this project's own site-config.ts precedent for exactly
 * this kind of duplicated-constant drift).
 */
export const MIN_PASSWORD_LENGTH = 8;
