import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

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
  getList: publicProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      return ctx.db.user.findMany({
        where: {
          locationId: input.locationId,
          role: { in: ['driver', 'staff'] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }),

  // ── drivers.authenticate ──────────────────────────────────────────────────
  authenticate: publicProcedure
    .input(z.object({
      userId:     z.string().uuid(),
      pin:        z.string().regex(/^\d{4}$/),
      locationId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      const user = await ctx.db.user.findFirst({
        where: { id: input.userId, locationId: input.locationId },
      });

      if (!user || !user.pin) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No PIN set for this user',
        });
      }

      const ok = await bcrypt.compare(input.pin, user.pin);
      if (!ok) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect PIN' });
      }

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

  // ── drivers.getMyRoute ────────────────────────────────────────────────────
  getMyRoute: publicProcedure
    .input(z.object({
      driverId:   z.string().uuid(),
      locationId: z.string().uuid(),
      date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      const date = input.date ?? todayDateString();
      const range = dateRangeForDay(date);

      return ctx.db.delivery.findMany({
        where: {
          driverId:   input.driverId,
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
    }),

  // ── drivers.markDelivered ─────────────────────────────────────────────────
  markDelivered: publicProcedure
    .input(z.object({
      deliveryId:  z.string().uuid(),
      driverId:    z.string().uuid(),
      driverNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const delivery = await ctx.db.delivery.findUnique({
        where: { id: input.deliveryId },
      });
      if (!delivery) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
      }
      if (delivery.driverId !== input.driverId) {
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
  reportIssue: publicProcedure
    .input(z.object({
      deliveryId:  z.string().uuid(),
      driverId:    z.string().uuid(),
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
      if (delivery.driverId !== input.driverId) {
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
  startRoute: publicProcedure
    .input(z.object({
      driverId:   z.string().uuid(),
      locationId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      const today = todayDateString();
      const range = dateRangeForDay(today);

      const result = await ctx.db.delivery.updateMany({
        where: {
          driverId:   input.driverId,
          locationId: input.locationId,
          status:     'scheduled',
          deliveryDate: { gte: range.gte, lt: range.lt },
        },
        data: { status: 'out_for_delivery' },
      });

      return { updated: result.count };
    }),

  // ── drivers.changePin ─────────────────────────────────────────────────────
  changePin: publicProcedure
    .input(z.object({
      driverId:   z.string().uuid(),
      currentPin: z.string().regex(/^\d{4}$/),
      newPin:     z.string().regex(/^\d{4}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findFirst({
        where: { id: input.driverId, role: { in: ['driver', 'staff'] } },
      });

      if (!user || !user.pin) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No PIN set for this user',
        });
      }

      const ok = await bcrypt.compare(input.currentPin, user.pin);
      if (!ok) {
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

      return { success: true };
    }),

  // ── drivers.routeHistory ──────────────────────────────────────────────────
  routeHistory: publicProcedure
    .input(z.object({
      driverId:   z.string().uuid(),
      locationId: z.string().uuid(),
      days:       z.number().int().min(1).max(90).default(14),
    }))
    .query(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      const user = await ctx.db.user.findFirst({
        where: {
          id:         input.driverId,
          locationId: input.locationId,
          role:       { in: ['driver', 'staff'] },
        },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Driver not found in this location' });
      }

      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - input.days);

      const rows = await ctx.db.delivery.findMany({
        where: {
          driverId:     input.driverId,
          locationId:   input.locationId,
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
  stats: publicProcedure
    .input(z.object({
      driverId:   z.string().uuid(),
      locationId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      await assertLocation(ctx.db, input.locationId);
      const user = await ctx.db.user.findFirst({
        where: {
          id:         input.driverId,
          locationId: input.locationId,
          role:       { in: ['driver', 'staff'] },
        },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Driver not found in this location' });
      }

      const today = todayDateString();
      const todayRange = dateRangeForDay(today);

      const since30 = new Date();
      since30.setUTCHours(0, 0, 0, 0);
      since30.setUTCDate(since30.getUTCDate() - 30);

      // Start of current week (Monday) in UTC
      const weekStart = new Date();
      weekStart.setUTCHours(0, 0, 0, 0);
      const dow = weekStart.getUTCDay(); // 0 Sun .. 6 Sat
      const daysFromMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
      weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);

      const baseWhere = {
        driverId:   input.driverId,
        locationId: input.locationId,
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
