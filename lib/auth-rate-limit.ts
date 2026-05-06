import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/db';

// Tunables. Bumped only after we have field data — defaults are intentionally
// conservative for a 4-digit PIN.
export const LOCKOUT_THRESHOLD       = 5;                 // failed attempts before lock
export const LOCKOUT_WINDOW_MS       = 15 * 60 * 1000;    // 15 minutes
export const IP_RATE_WINDOW_SECONDS  = 60;                // sliding window
export const IP_RATE_MAX_AUTH        = 30;                // authenticate attempts/IP/min
export const IP_RATE_MAX_GETLIST     = 60;                // getList queries/IP/min

export type AuthScope =
  | 'driver.authenticate'
  | 'driver.changePin'
  | 'driver.getList';

export type AuditAttempt = {
  scope:      AuthScope;
  userId?:    string | null;
  locationId?: string | null;
  ip?:        string | null;
  userAgent?: string | null;
  success:    boolean;
  reason?:    string;
};

// Append-only — never throw from here. Audit failures must not mask auth
// failures, and we'd rather lose one log line than 500 a real driver.
export async function recordAuthAttempt(a: AuditAttempt): Promise<void> {
  try {
    await prisma.authAuditLog.create({
      data: {
        scope:      a.scope,
        userId:     a.userId     ?? null,
        locationId: a.locationId ?? null,
        ip:         a.ip         ?? null,
        userAgent:  a.userAgent  ?? null,
        success:    a.success,
        reason:     a.reason     ?? null,
      },
    });
  } catch {
    // intentionally swallowed
  }
}

// Refuses the request if this IP has made too many of the given scope in the
// rolling window. Counts the audit log itself — a separate counters table
// would be redundant. The composite index (ip, scope, createdAt) keeps the
// count cheap.
export async function assertIpUnderLimit(
  ip: string | null | undefined,
  scope: AuthScope,
  max: number,
): Promise<void> {
  if (!ip) return; // no header = no limit; logged for visibility downstream
  const since = new Date(Date.now() - IP_RATE_WINDOW_SECONDS * 1000);
  const count = await prisma.authAuditLog.count({
    where: { ip, scope, createdAt: { gte: since } },
  });
  if (count >= max) {
    throw new TRPCError({
      code:    'TOO_MANY_REQUESTS',
      message: 'Too many requests — slow down and try again in a minute.',
    });
  }
}

// Throws UNAUTHORIZED if the user is currently locked out. Also returns the
// (now-stale) row so callers can decide whether to clear it on success.
export async function assertNotLocked(userId: string): Promise<void> {
  const row = await prisma.pinFailure.findUnique({ where: { userId } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    throw new TRPCError({
      code:    'UNAUTHORIZED',
      message: 'Too many failed attempts. Try again in a few minutes.',
    });
  }
}

// Atomic-ish failure bookkeeping. Two-step inside a transaction:
//
//   1. Upsert the row, incrementing failedAttempts. If it was already locked
//      and the lock has expired, the increment runs against a row whose
//      counter we treat as 1 (handled in step 2).
//   2. Read the new counter; if it crossed the threshold, set lockedUntil.
//
// Two writers racing here can both end up incrementing past 5; that's fine —
// the lockout still fires. Worst case we lock for slightly longer than 15min
// because two threshold crossings collapse, which is the safe direction.
export async function recordFailureAndMaybeLock(userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.pinFailure.findUnique({ where: { userId } });

    let nextAttempts: number;
    if (!existing) {
      nextAttempts = 1;
      await tx.pinFailure.create({
        data: { userId, failedAttempts: 1, lastAttemptAt: now },
      });
    } else if (existing.lockedUntil && existing.lockedUntil <= now) {
      // Previous lock expired — start a new streak.
      nextAttempts = 1;
      await tx.pinFailure.update({
        where: { userId },
        data:  { failedAttempts: 1, lockedUntil: null, lastAttemptAt: now },
      });
    } else {
      nextAttempts = existing.failedAttempts + 1;
      await tx.pinFailure.update({
        where: { userId },
        data:  {
          failedAttempts: { increment: 1 },
          lastAttemptAt:  now,
        },
      });
    }

    if (nextAttempts >= LOCKOUT_THRESHOLD) {
      await tx.pinFailure.update({
        where: { userId },
        data:  { lockedUntil: new Date(now.getTime() + LOCKOUT_WINDOW_MS) },
      });
    }
  });
}

// Clears the lockout state on a confirmed-good attempt. Idempotent.
export async function clearFailures(userId: string): Promise<void> {
  await prisma.pinFailure.upsert({
    where:  { userId },
    create: { userId, failedAttempts: 0, lockedUntil: null },
    update: { failedAttempts: 0, lockedUntil: null },
  });
}
