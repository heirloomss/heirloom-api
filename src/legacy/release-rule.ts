import { LegacyPlan, LegacyPlanStatus } from '@prisma/client';

export type ReleaseRuleKind = 'IMMEDIATELY' | 'AFTER_DAYS' | 'ON_DATE' | 'AT_AGE' | 'ON_EVENT';

export interface ReleaseRule {
  kind: ReleaseRuleKind;
  value?: string | number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse the JSON stored on a message into a typed rule. */
export function parseReleaseRule(raw: unknown): ReleaseRule {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'IMMEDIATELY' };
  }
  const obj = raw as { kind?: unknown; value?: unknown };
  const kind = obj.kind;
  if (
    kind === 'IMMEDIATELY' ||
    kind === 'AFTER_DAYS' ||
    kind === 'ON_DATE' ||
    kind === 'AT_AGE' ||
    kind === 'ON_EVENT'
  ) {
    return { kind, value: obj.value as string | number | undefined };
  }
  return { kind: 'IMMEDIATELY' };
}

/** Calm label shown on the Legacy Journey timeline. */
export function releaseRuleLabel(rule: ReleaseRule): string {
  switch (rule.kind) {
    case 'AFTER_DAYS':
      return `After ${Number(rule.value) || 30} Days`;
    case 'ON_DATE':
      return rule.value ? `On ${String(rule.value)}` : 'On a chosen date';
    case 'AT_AGE':
      return `On ${Number(rule.value) || 18}th Birthday`;
    case 'ON_EVENT': {
      const event = String(rule.value ?? '').toLowerCase();
      if (event === 'marriage' || event === 'wedding') return 'On Wedding Day';
      if (event === 'graduation') return 'On Graduation';
      return 'Future Milestone';
    }
    default:
      return 'Immediately';
  }
}

/**
 * Whether a Journey item should be revealed to a beneficiary. The owner always
 * sees the planned timeline; the capsule only opens an item once its rule is met.
 */
export function isReleaseDue(
  rule: ReleaseRule,
  plan: LegacyPlan | null,
  opts: { dateOfBirth?: Date | null; now?: Date } = {},
): boolean {
  const now = opts.now ?? new Date();
  const status = plan?.status ?? LegacyPlanStatus.DRAFT;
  const revealed =
    status === LegacyPlanStatus.VERIFIED || status === LegacyPlanStatus.RELEASED;
  if (!revealed) {
    return false;
  }

  switch (rule.kind) {
    case 'IMMEDIATELY':
      return true;
    case 'AFTER_DAYS': {
      const days = Number(rule.value) || 0;
      const anchor = plan?.releasedAt ?? plan?.verifiedAt;
      if (!anchor) return false;
      return now.getTime() - anchor.getTime() >= days * DAY_MS;
    }
    case 'ON_DATE': {
      if (!rule.value) return false;
      const when = new Date(String(rule.value));
      return !Number.isNaN(when.getTime()) && now >= when;
    }
    case 'AT_AGE': {
      const age = Number(rule.value);
      const dob = opts.dateOfBirth;
      if (!dob || !Number.isFinite(age)) return false;
      const reached = new Date(dob);
      reached.setFullYear(reached.getFullYear() + age);
      return now >= reached;
    }
    case 'ON_EVENT': {
      const event = String(rule.value ?? '').toLowerCase();
      const confirmed = Array.isArray(plan?.confirmedEvents)
        ? (plan?.confirmedEvents as unknown[]).map((e) => String(e).toLowerCase())
        : [];
      return event.length > 0 && confirmed.includes(event);
    }
    default:
      return true;
  }
}
