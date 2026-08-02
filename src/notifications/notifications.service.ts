import { Injectable, Logger } from '@nestjs/common';

/**
 * Notifications for Heirloom. For the MVP this logs "emails" to the console
 * with the calm product voice. A real provider (Resend, Postmark, SES) swaps
 * in behind these same method signatures without touching callers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private send(to: string, subject: string, body: string): void {
    this.logger.log(`✉  To: ${to} | ${subject}\n   ${body}`);
  }

  /** Sent when a user nominates a guardian. */
  guardianInvited(email: string, name: string, ownerName: string): void {
    this.send(
      email,
      `${ownerName} would like you to be a Heirloom guardian`,
      `Hi ${name}, ${ownerName} trusts you to help look after their legacy. ` +
        `There's nothing to do right now — we'll only ever reach out if it's needed.`,
    );
  }

  /** Sent when a guardian accepts / is verified. */
  guardianAccepted(ownerEmail: string, guardianName: string): void {
    this.send(
      ownerEmail,
      'A guardian accepted your invitation',
      `${guardianName} has agreed to be one of your trusted guardians. ` +
        `Your legacy plan is a little more protected today.`,
    );
  }

  /** Upcoming Life Check-In reminder. */
  checkInReminder(email: string, daysRemaining: number): void {
    this.send(
      email,
      "We're just checking in",
      `Your next Life Check-In is in ${daysRemaining} days. ` +
        `Whenever you're ready, tap "I'm Here" — that's all it takes.`,
    );
  }

  /** A check-in was missed — reaching out gently, not alarming. */
  checkInMissed(email: string): void {
    this.send(
      email,
      "It's been a while since your last check-in",
      `We're just making sure everything is okay. Your information is safe. ` +
        `When you get a moment, tap "I'm Here" to let us know you're around.`,
    );
  }

  /** Guardians are notified when verification begins. */
  guardianVerificationRequested(email: string, guardianName: string, ownerName: string): void {
    this.send(
      email,
      `A gentle request regarding ${ownerName}'s legacy`,
      `Hi ${guardianName}, we haven't heard from ${ownerName} in a while. ` +
        `As one of their trusted guardians, we'd be grateful if you could help us confirm things.`,
    );
  }

  /** A beneficiary has a legacy waiting. */
  beneficiaryNotified(email: string, beneficiaryName: string): void {
    this.send(
      email,
      'A legacy has been prepared for you',
      `Hi ${beneficiaryName}, someone who cared about you has prepared a gift. ` +
        `When you're ready, you can open your legacy.`,
    );
  }

  /** Confirmation that a beneficiary claimed their assets. */
  assetClaimed(ownerEmail: string, beneficiaryName: string): void {
    this.send(
      ownerEmail,
      'A beneficiary has received their legacy',
      `${beneficiaryName} has successfully claimed what you left for them.`,
    );
  }

  /** The Legacy Journey was updated. */
  legacyUpdated(email: string): void {
    this.send(
      email,
      'Your Legacy Journey has been updated',
      `Your plan is up to date. Thank you for taking care of the people you love.`,
    );
  }
}
