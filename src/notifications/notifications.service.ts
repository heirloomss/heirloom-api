import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationChannel, wantsChannel } from './notification-preferences';

/**
 * Transactional email for Heirloome, sent through Resend. The public methods are
 * fire-and-forget (they never throw): a failed or unconfigured send is logged,
 * never surfaced to the caller, so notifications can't break a legacy action.
 *
 * If RESEND_API_KEY is absent the service is "not configured": nothing is sent
 * and each attempt logs a clear warning — it NEVER claims an email went out.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly resend?: Resend;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'Heirloome <onboarding@resend.dev>';
    this.enabled = Boolean(apiKey);

    if (this.enabled) {
      this.resend = new Resend(apiKey);
      this.logger.log('NotificationsService connected to Resend.');
    } else {
      this.logger.warn(
        'NotificationsService is NOT configured (missing RESEND_API_KEY). ' +
          'Emails will be logged and skipped until it is set.',
      );
    }
  }

  /** Sent when a user nominates a guardian. */
  guardianInvited(email: string, name: string, ownerName: string): void {
    void this.dispatch(
      email,
      `${ownerName} would like you to be a Heirloome guardian`,
      this.layout(
        'You’ve been trusted',
        `<p>Hi ${esc(name)},</p>
         <p>${esc(ownerName)} trusts you to help look after their legacy on
         Heirloome. There’s nothing to do right now — we’ll only ever reach out
         if it’s truly needed, and only to confirm things gently.</p>
         <p>Thank you for being someone they can count on.</p>`,
      ),
    );
  }

  /** Sent when a guardian accepts / is verified. Gated by the owner's prefs. */
  guardianAccepted(ownerEmail: string, guardianName: string, ownerPrefs?: unknown): void {
    if (!this.ownerWants(ownerPrefs, 'guardianResponses')) return;
    void this.dispatch(
      ownerEmail,
      'A guardian accepted your invitation',
      this.layout(
        'A little more protected',
        `<p>${esc(guardianName)} has agreed to be one of your trusted
         guardians. Your legacy plan is a little more protected today.</p>`,
      ),
    );
  }

  /** Upcoming Life Check-In reminder. Gated by the owner's prefs. */
  checkInReminder(email: string, daysRemaining: number, ownerPrefs?: unknown): void {
    if (!this.ownerWants(ownerPrefs, 'checkInReminders')) return;
    void this.dispatch(
      email,
      'We’re just checking in',
      this.layout(
        'We’re just checking in',
        `<p>Your next Life Check-In is in ${daysRemaining} days. Whenever
         you’re ready, tap <strong>“I’m Here”</strong> — that’s all it takes.</p>`,
      ),
    );
  }

  /** A check-in was missed — reaching out gently, not alarming. */
  checkInMissed(email: string): void {
    void this.dispatch(
      email,
      'It’s been a while since your last check-in',
      this.layout(
        'Everything okay?',
        `<p>We’re just making sure everything is okay. Your information is
         safe. When you get a moment, tap <strong>“I’m Here”</strong> to let us
         know you’re around.</p>`,
      ),
    );
  }
  /** Guardians are notified when verification begins. */
  guardianVerificationRequested(email: string, guardianName: string, ownerName: string): void {
    void this.dispatch(
      email,
      `A gentle request regarding ${ownerName}’s legacy`,
      this.layout(
        'A gentle request',
        `<p>Hi ${esc(guardianName)},</p>
         <p>We haven’t heard from ${esc(ownerName)} in a while. As one of their
         trusted guardians, we’d be grateful if you could help us confirm
         things. When you’re ready, open Heirloome and connect your wallet to
         review the request.</p>`,
      ),
    );
  }

  /**
   * A beneficiary has a legacy waiting. The `claimUrl` is their private, token
   * -scoped link to the Legacy Capsule — the only way in, since a beneficiary
   * has no account. It lets them VIEW and, when ready, sign for their own share;
   * it can never move funds on its own.
   */
  beneficiaryNotified(email: string, beneficiaryName: string, claimUrl?: string): void {
    const cta = claimUrl
      ? `<p style="margin-top:24px;">
           <a href="${esc(claimUrl)}" style="display:inline-block;background:#a08a6a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:16px;">Open your legacy</a>
         </p>
         <p style="font-size:13px;color:#9a9a9a;">This link is private to you.
         Please keep it safe — it’s how you’ll reach what was left for you.</p>`
      : '';
    void this.dispatch(
      email,
      'A legacy has been prepared for you',
      this.layout(
        'Something was left for you',
        `<p>Hi ${esc(beneficiaryName)},</p>
         <p>Someone who cared about you has prepared a gift on Heirloome. When
         you’re ready — there’s no rush — you can open your legacy and see what
         they left for you.</p>
         ${cta}`,
      ),
    );
  }

  /** Confirmation that a beneficiary claimed their assets. Gated by the owner's prefs. */
  assetClaimed(ownerEmail: string, beneficiaryName: string, ownerPrefs?: unknown): void {
    if (!this.ownerWants(ownerPrefs, 'beneficiaryClaims')) return;
    void this.dispatch(
      ownerEmail,
      'A beneficiary has received their legacy',
      this.layout(
        'It reached them',
        `<p>${esc(beneficiaryName)} has successfully received what you left for
         them. Everything arrived safely.</p>`,
      ),
    );
  }

  /** The Legacy Journey was updated. */
  legacyUpdated(email: string): void {
    void this.dispatch(
      email,
      'Your Legacy Journey has been updated',
      this.layout(
        'Your plan is up to date',
        `<p>Your Legacy Journey has been updated and everything is in order.
         Thank you for taking care of the people you love.</p>`,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers.
  // -------------------------------------------------------------------------

  /**
   * Whether the owner wants a courtesy email on `channel`. Preferences gate only
   * the owner's own inbox; a null/absent preference resolves to on so a new
   * account never silently loses a notification.
   */
  private ownerWants(prefs: unknown, channel: NotificationChannel): boolean {
    return wantsChannel(prefs, channel);
  }

  /**
   * Send an email, swallowing every failure. Notifications must never break the
   * action that triggered them, and an unconfigured provider logs clearly
   * rather than pretending success.
   */
  private async dispatch(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email skipped (Resend not configured) → to: ${to} | ${subject}`);
      return;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Email to ${to} failed: ${error.message ?? 'unknown error'}`);
      }
    } catch (err) {
      this.logger.error(
        `Email to ${to} threw: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  /** Wrap body HTML in Heirloome's calm, minimal email shell. */
  private layout(heading: string, body: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f5f2;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:28px 36px 8px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#a08a6a;">Heirloome</td>
            </tr>
            <tr>
              <td style="padding:0 36px 8px;font-size:24px;line-height:1.3;color:#1f1f1f;">${esc(heading)}</td>
            </tr>
            <tr>
              <td style="padding:8px 36px 28px;font-size:16px;line-height:1.7;color:#4a4a4a;">${body}</td>
            </tr>
            <tr>
              <td style="padding:20px 36px 28px;font-size:13px;line-height:1.6;color:#9a9a9a;border-top:1px solid #eee;">
                Heirloome keeps what matters safe, and passes it on when the time is right.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}

/** Escape user-supplied text before it goes into an HTML email. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
