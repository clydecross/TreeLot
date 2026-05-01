import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, staffProcedure } from '../trpc';
import { DeliveryStatus } from '@/lib/generated/prisma/enums';

const deliveryStatusSchema = z.enum([
  'unassigned',
  'scheduled',
  'out_for_delivery',
  'delivered',
  'failed',
]);

const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  unassigned:       ['scheduled'],
  scheduled:        ['out_for_delivery', 'unassigned'],
  out_for_delivery: ['delivered', 'failed'],
  delivered:        [],
  failed:           ['scheduled'],
};

// Loads a delivery by id, scoped to the user's org. Returns the row + status,
// or throws NOT_FOUND. Used to gate every mutation against cross-org access.
async function loadOwnedDelivery(
  db: typeof import('@/lib/db').prisma,
  id: string,
  orgId: string,
) {
  const row = await db.delivery.findFirst({
    where: { id, location: { orgId } },
    select: { id: true, status: true, locationId: true, driverId: true },
  });
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
  }
  return row;
}

export const deliveriesRouter = router({
  // ── deliveries.getByDate ──────────────────────────────────────────────────
  getByDate: staffProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];

      const day = new Date(`${input.date}T00:00:00.000Z`);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);

      return ctx.db.delivery.findMany({
        where: {
          locationId:   ctx.user.locationId,
          deliveryDate: { gte: day, lt: next },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, phone: true } },
          purchase: {
            select: {
              treeType:       true,
              treeTypeName:   true,
              treeSizeRange:  true,
              standIncluded:  true,
              lightsIncluded: true,
            },
          },
          driver: { select: { id: true, name: true } },
        },
        orderBy: [
          { routeOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
      });
    }),

  // ── deliveries.assignDriver ───────────────────────────────────────────────
  assignDriver: staffProcedure
    .input(z.object({
      deliveryId: z.string().uuid(),
      driverId:   z.string().uuid().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await loadOwnedDelivery(ctx.db, input.deliveryId, ctx.user.orgId);

      if (input.driverId === null) {
        return ctx.db.delivery.update({
          where: { id: input.deliveryId },
          data: {
            driverId:   null,
            status:     'unassigned',
            routeOrder: null,
          },
        });
      }

      // Verify the proposed driver is in the same org.
      const driver = await ctx.db.user.findFirst({
        where: { id: input.driverId, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!driver) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Driver not in your org' });
      }

      return ctx.db.delivery.update({
        where: { id: input.deliveryId },
        data: {
          driverId: input.driverId,
          status:   existing.status === 'unassigned' ? 'scheduled' : existing.status,
        },
      });
    }),

  // ── deliveries.setRouteOrder ──────────────────────────────────────────────
  setRouteOrder: staffProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ input, ctx }) => {
      if (input.ids.length === 0) return { updated: 0 };

      // Verify every id belongs to the user's org in one query.
      const owned = await ctx.db.delivery.findMany({
        where: { id: { in: input.ids }, location: { orgId: ctx.user.orgId } },
        select: { id: true },
      });
      if (owned.length !== input.ids.length) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'One or more deliveries are not in your org' });
      }

      const result = await ctx.db.$transaction(
        input.ids.map((id, i) =>
          ctx.db.delivery.update({
            where: { id },
            data:  { routeOrder: i },
          })
        )
      );
      return { updated: result.length };
    }),

  // ── deliveries.updateStatus ───────────────────────────────────────────────
  updateStatus: staffProcedure
    .input(z.object({
      deliveryId: z.string().uuid(),
      status:     deliveryStatusSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await loadOwnedDelivery(ctx.db, input.deliveryId, ctx.user.orgId);

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid transition: ${existing.status} → ${input.status}`,
        });
      }

      return ctx.db.delivery.update({
        where: { id: input.deliveryId },
        data: {
          status:      input.status,
          deliveredAt: input.status === 'delivered' ? new Date() : undefined,
        },
      });
    }),

  // ── deliveries.getById ────────────────────────────────────────────────────
  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.delivery.findFirst({
        where: { id: input.id, location: { orgId: ctx.user.orgId } },
        include: {
          customer: true,
          purchase: true,
          driver:   { select: { id: true, name: true } },
        },
      });
    }),
});
