import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { router, publicProcedure, driverSessionProcedure } from '../trpc';
import { signDriverSession, DRIVER_SESSION_COOKIE } from '@/lib/driver-session';
import {
  IP_RATE_MAX_AUTH,
  IP_RATE_MAX_GETLIST,
  assertIpUnderLimit,
  assertNotLocked,
  clearFailures,
  recordAuthAttempt,
  recordFailureAndMaybeLock,
} from '@/lib/auth-rate-limit';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateRangeForDay(date: string): { gte: Date; lt: Date } {
  const gte = new Date(`${date}T00:00:00.000Z`);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

// Confirms the URL-supplied locationId is a real Location row. Throws NOT_FOUND
// otherwise — same response whether the UUID is well-formed or not, so we
// don't help an attacker enumerate locations by timing/error differences.
async function assertLocation(
  db: typeof import('@/lib/db').prisma,
  locationId: string,
) {
  const loc = await db.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  if (!loc) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Lot not found' });
  }
}

export const driversRouter = router({
  // ── drivers.getList ───────────────────────────────────────────────────────
  // Pre-session: rendered on the PIN-select screen so a driver can pick their
  // name. Public on purpose; only returns names + ids for the requested lot.
  getList: publicProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertIpUnderLimit(ctx.ip, 'driver.getList', IP_RATE_MAX_GETLIST);
      await assertLocation(ctx.db, input.locationId);

      const drivers = await ctx.db.user.findMany({
        where: {
          locationId: input.locationId,
          role: { in: ['driver', 'staff'] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

      // Audit the lookup itself — feeds the IP rate limiter and gives us a
      // signal if a single IP starts walking lots.
      await recordAuthAttempt({
        scope:      'driver.getList',
        locationId: input.locationId,
        ip:         ctx.ip,
        userAgent:  ctx.userAgent,
        success:    true,
      });

      return drivers;
    }),

  // ── drivers.authenticate ──────────────────────────────────────────────────
  // PIN login. On success, sets an HttpOnly session cookie. The cookie carries
  // a signed token containing driverId + locationId + orgId — every subsequent
  // driver call reads identity from that, never from the client.
  authenticate: publicProcedure
    .input(z.object({
      userId:     z.string().uuid(),
      pin:        z.string().regex(/^\d{4}$/),
      locationId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Three gates, in order, before we touch bcrypt:
      //   1. IP rate limit — bounds total attempts per minute per source IP.
      //   2. Location existence — same UNAUTHORIZED-shaped error as elsewhere.
      //   3. Per-user lockout — short-circuits the bcrypt cost for locked users
      //      and prevents an attacker from stretching a streak past N tries
      //      even at low request rates.
      // userId in audit rows is intentionally null for the early gates: we
      // haven't verified the user exists yet, and auth_audit_log has an FK to
      // users that would silently drop the row on a bogus id. IP + UA still
      // preserves the forensic trail.
      try {
        await assertIpUnderLimit(ctx.ip, 'driver.authenticate', IP_RATE_MAX_AUTH);
      } catch (e) {
        await recordAuthAttempt({
          scope: 'driver.authenticate', userId: null, locationId: input.locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false, reason: 'rate_limited',
        });
        throw e;
      }

      await assertLocation(ctx.db, input.locationId);

      try {
        await assertNotLocked(input.userId);
      } catch (e) {
        // Lockout row exists, so the userId is real (FK guaranteed it).
        await recordAuthAttempt({
          scope: 'driver.authenticate', userId: input.userId, locationId: input.locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false, reason: 'locked',
        });
        throw e;
      }

      const user = await ctx.db.user.findFirst({
        where: { id: input.userId, locationId: input.locationId },
      });

      if (!user || !user.pin) {
        // Don't increment a per-user lockout for a non-existent userId —
        // pin_failures has an FK to users. The IP rate limit above already
        // bounds enumeration; this branch just needs to be audited.
        // userId is dropped (FK) but the IP/UA still tells us who's probing.
        await recordAuthAttempt({
          scope: 'driver.authenticate', userId: user ? user.id : null, locationId: input.locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false,
          reason: user ? 'no_pin' : 'no_user',
        });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No PIN set for this user',
        });
      }

      const ok = await bcrypt.compare(input.pin, user.pin);
      if (!ok) {
        await recordFailureAndMaybeLock(user.id);
        await recordAuthAttempt({
          scope: 'driver.authenticate', userId: user.id, locationId: input.locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false, reason: 'bad_pin',
        });
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect PIN' });
      }

      await clearFailures(user.id);
      await recordAuthAttempt({
        scope: 'driver.authenticate', userId: user.id, locationId: input.locationId,
        ip: ctx.ip, userAgent: ctx.userAgent, success: true,
      });

      const token = signDriverSession({
        driverId:   user.id,
        locationId: input.locationId,
        orgId:      user.orgId,
      });
      const cookieStore = await cookies();
      cookieStore.set(DRIVER_SESSION_COOKIE, token, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path:     '/',
        // No maxAge → session cookie. Clears on browser close. The token's
        // own 12h exp is the upper bound if the browser is left open.
      });

      const today = todayDateString();
      const range = dateRangeForDay(today);

      const todayStops = await ctx.db.delivery.findMany({
        where: {
          driverId:   user.id,
          locationId: input.locationId,
          deliveryDate: { gte: range.gte, lt: range.lt },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, phone: true } },
          purchase: {
            select: { treeType: true, treeTypeName: true, treeSizeRange: true },
          },
        },
        orderBy: [
          { routeOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
      });

      return { driverId: user.id, name: user.name, todayStops };
    }),

  // ── drivers.logout ────────────────────────────────────────────────────────
  logout: publicProcedure.mutation(async () => {
    const cookieStore = await cookies();
    cookieStore.delete(DRIVER_SESSION_COOKIE);
    return { success: true };
  }),

  // ── drivers.me ────────────────────────────────────────────────────────────
  // Lets the client confirm "yes, the cookie is still valid" without firing
  // a heavier query. Returns the driver's display name.
  me: driverSessionProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where:  { id: ctx.driver.driverId },
      select: { id: true, name: true },
    });
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Driver not found' });
    }
    return { driverId: user.id, name: user.name };
  }),

  // ── drivers.getMyRoute ────────────────────────────────────────────────────
  getMyRoute: driverSessionProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const date = input.date ?? todayDateString();
      const range = dateRangeForDay(date);

      return ctx.db.delivery.findMany({
        where: {
          driverId:   ctx.driver.driverId,
          locationId: ctx.driver.locationId,
          deliveryDate: { gte: range.gte, lt: range.lt },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, phone: true } },
          purchase: {
            select: { treeType: true, treeTypeName: true, treeSizeRange: true },
          },
        },
        orderBy: [
          { routeOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
      });
    }),

  // ── drivers.markDelivered ─────────────────────────────────────────────────
  markDelivered: driverSessionProcedure
    .input(z.object({
      deliveryId:  z.string().uuid(),
      driverNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const delivery = await ctx.db.delivery.findUnique({
        where: { id: input.deliveryId },
      });
      if (!delivery) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
      }
      if (delivery.driverId !== ctx.driver.driverId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your delivery' });
      }

      return ctx.db.delivery.update({
        where: { id: input.deliveryId },
        data: {
          status:      'delivered',
          deliveredAt: new Date(),
          ...(input.driverNotes !== undefined ? { driverNotes: input.driverNotes } : {}),
        },
      });
    }),

  // ── drivers.reportIssue ───────────────────────────────────────────────────
  reportIssue: driverSessionProcedure
    .input(z.object({
      deliveryId:  z.string().uuid(),
      issueReason: z.string().min(1),
      driverNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const delivery = await ctx.db.delivery.findUnique({
        where: { id: input.deliveryId },
      });
      if (!delivery) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
      }
      if (delivery.driverId !== ctx.driver.driverId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your delivery' });
      }

      return ctx.db.delivery.update({
        where: { id: input.deliveryId },
        data: {
          status:      'failed',
          issueReason: input.issueReason,
          ...(input.driverNotes !== undefined ? { driverNotes: input.driverNotes } : {}),
        },
      });
    }),

  // ── drivers.startRoute ────────────────────────────────────────────────────
  startRoute: driverSessionProcedure.mutation(async ({ ctx }) => {
    const today = todayDateString();
    const range = dateRangeForDay(today);

    const result = await ctx.db.delivery.updateMany({
      where: {
        driverId:   ctx.driver.driverId,
        locationId: ctx.driver.locationId,
        status:     'scheduled',
        deliveryDate: { gte: range.gte, lt: range.lt },
      },
      data: { status: 'out_for_delivery' },
    });

    return { updated: result.count };
  }),

  // ── drivers.changePin ─────────────────────────────────────────────────────
  changePin: driverSessionProcedure
    .input(z.object({
      currentPin: z.string().regex(/^\d{4}$/),
      newPin:     z.string().regex(/^\d{4}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      const driverId   = ctx.driver.driverId;
      const locationId = ctx.driver.locationId;

      // Same gating as authenticate — a hijacked driver cookie shouldn't get
      // unlimited attempts at the current PIN.
      // changePin runs under driverSessionProcedure, so the driverId came
      // from a verified HMAC-signed cookie — safe to pass to the audit log
      // FK without an existence check.
      try {
        await assertIpUnderLimit(ctx.ip, 'driver.changePin', IP_RATE_MAX_AUTH);
        await assertNotLocked(driverId);
      } catch (e) {
        await recordAuthAttempt({
          scope: 'driver.changePin', userId: driverId, locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false,
          reason: e instanceof TRPCError && e.code === 'TOO_MANY_REQUESTS' ? 'rate_limited' : 'locked',
        });
        throw e;
      }

      const user = await ctx.db.user.findFirst({
        where: { id: driverId, role: { in: ['driver', 'staff'] } },
      });

      if (!user || !user.pin) {
        await recordAuthAttempt({
          scope: 'driver.changePin', userId: driverId, locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false, reason: 'no_user',
        });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No PIN set for this user',
        });
      }

      const ok = await bcrypt.compare(input.currentPin, user.pin);
      if (!ok) {
        await recordFailureAndMaybeLock(user.id);
        await recordAuthAttempt({
          scope: 'driver.changePin', userId: user.id, locationId,
          ip: ctx.ip, userAgent: ctx.userAgent, success: false, reason: 'bad_pin',
        });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Current PIN incorrect',
        });
      }

      const hashed = await bcrypt.hash(input.newPin, 10);
      await ctx.db.user.update({
        where: { id: user.id },
        data:  { pin: hashed },
      });

      await clearFailures(user.id);
      await recordAuthAttempt({
        scope: 'driver.changePin', userId: user.id, locationId,
        ip: ctx.ip, userAgent: ctx.userAgent, success: true,
      });

      return { success: true };
    }),

  // ── drivers.routeHistory ──────────────────────────────────────────────────
  routeHistory: driverSessionProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(14),
    }))
    .query(async ({ input, ctx }) => {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - input.days);

      const rows = await ctx.db.delivery.findMany({
        where: {
          driverId:     ctx.driver.driverId,
          locationId:   ctx.driver.locationId,
          deliveryDate: { gte: since },
        },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          purchase: { select: { treeType: true, treeSizeRange: true } },
        },
        orderBy: [
          { deliveryDate: 'desc' },
          { routeOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
      });

      const groups = new Map<string, Array<{
        id: string;
        deliveryDate: string;
        addressLine1: string;
        city: string;
        status: string;
        deliveredAt: string | null;
        customer: { firstName: string; lastName: string };
        purchase: { treeType: string; treeSizeRange: string };
      }>>();

      for (const r of rows) {
        const date = r.deliveryDate.toISOString().slice(0, 10);
        const stop = {
          id:           r.id,
          deliveryDate: date,
          addressLine1: r.addressLine1,
          city:         r.city,
          status:       r.status,
          deliveredAt:  r.deliveredAt ? r.deliveredAt.toISOString() : null,
          customer:     r.customer,
          purchase:     r.purchase,
        };
        const existing = groups.get(date);
        if (existing) {
          existing.push(stop);
        } else {
          groups.set(date, [stop]);
        }
      }

      return Array.from(groups.entries())
        .map(([date, stops]) => ({ date, stops }))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }),

  // ── drivers.stats ─────────────────────────────────────────────────────────
  stats: driverSessionProcedure.query(async ({ ctx }) => {
    const today = todayDateString();
    const todayRange = dateRangeForDay(today);

    const since30 = new Date();
    since30.setUTCHours(0, 0, 0, 0);
    since30.setUTCDate(since30.getUTCDate() - 30);

    // Start of current week (Monday) in UTC
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    const dow = weekStart.getUTCDay(); // 0 Sun .. 6 Sat
    const daysFromMonday = (dow + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);

    const baseWhere = {
      driverId:   ctx.driver.driverId,
      locationId: ctx.driver.locationId,
    };

    const [totalDelivered, totalFailed, thisWeekDelivered, todayScheduled] = await Promise.all([
      ctx.db.delivery.count({
        where: {
          ...baseWhere,
          status:       'delivered',
          deliveryDate: { gte: since30 },
        },
      }),
      ctx.db.delivery.count({
        where: {
          ...baseWhere,
          status:       'failed',
          deliveryDate: { gte: since30 },
        },
      }),
      ctx.db.delivery.count({
        where: {
          ...baseWhere,
          status:      'delivered',
          deliveredAt: { gte: weekStart },
        },
      }),
      ctx.db.delivery.count({
        where: {
          ...baseWhere,
          deliveryDate: { gte: todayRange.gte, lt: todayRange.lt },
        },
      }),
    ]);

    const denom = totalDelivered + totalFailed;
    const successRate = denom === 0 ? 0 : totalDelivered / denom;

    return {
      totalDelivered,
      totalFailed,
      successRate,
      thisWeekDelivered,
      todayScheduled,
    };
  }),
});
