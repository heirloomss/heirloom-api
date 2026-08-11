/**
 * Per-owner notification preferences.
 *
 * These gate ONLY the emails that go to the owner's own inbox (check-in
 * reminders, guardian responses, beneficiary claims). Safety-critical emails to
 * third parties — inviting a guardian, asking a guardian to verify, telling a
 * beneficiary a legacy is waiting — are never gated by these toggles, and the
 * Life Check-In state machine itself is unaffected: turning a channel off only
 * silences a courtesy email, it never changes what the plan does.
 *
 * Defaults are on. A null/absent preference resolves to on so a freshly created
 * account never silently loses a notification.
 */
export type NotificationChannel = 'checkInReminders' | 'guardianResponses' | 'beneficiaryClaims';

export type NotificationPreferences = Record<NotificationChannel, boolean>;

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'checkInReminders',
  'guardianResponses',
  'beneficiaryClaims',
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  checkInReminders: true,
  guardianResponses: true,
  beneficiaryClaims: true,
};

/** Merge stored (possibly partial, null, or malformed) prefs onto safe-on defaults. */
export function resolveNotificationPreferences(stored: unknown): NotificationPreferences {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (stored && typeof stored === 'object') {
    for (const channel of NOTIFICATION_CHANNELS) {
      const value = (stored as Record<string, unknown>)[channel];
      if (typeof value === 'boolean') prefs[channel] = value;
    }
  }
  return prefs;
}

/** True when the owner wants email on `channel` (defaults to true when unset). */
export function wantsChannel(stored: unknown, channel: NotificationChannel): boolean {
  return resolveNotificationPreferences(stored)[channel];
}
