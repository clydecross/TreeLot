import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
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

export const deliveriesRouter = router({
  // ── deliveries.getByDate ──────────────────────────────────────────────────
  getByDate: publicProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input, ctx }) => {
      const day = new Date(`${input.date}T00:00:00.000Z`);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);

      const rows = await ctx.db.delivery.findMany({
        where: {
          locationId: input.locationId,
          deliveryDate: { gte: day, lt: next },
        },
        include: {
          customer: {
            select: { firstName: true, lastName: true, phone: true },
          },
          purchase: {
            select: {
              treeType: true,
              treeTypeName: true,
              treeSizeRange: true,
              standIncluded: true,
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

      return rows;
    }),

  // ── deliveries.assignDriver ───────────────────────────────────────────────
  assignDriver: publicProcedure
    .input(z.object({
      deliveryId: z.string().uuid(),
      driverId:   z.string().uuid().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.delivery.findUnique({
        where: { id: input.deliveryId },
        select: { status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
      }

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

      return ctx.db.delivery.update({
        where: { id: input.deliveryId },
        data: {
          driverId: input.driverId,
          status:   existing.status === 'unassigned' ? 'scheduled' : existing.status,
        },
      });
    }),

  // ── deliveries.setRouteOrder ──────────────────────────────────────────────
  setRouteOrder: publicProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ input, ctx }) => {
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
  updateStatus: publicProcedure
    .input(z.object({
      deliveryId: z.string().uuid(),
      status:     deliveryStatusSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.delivery.findUnique({
        where: { id: input.deliveryId },
        select: { status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery not found' });
      }

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
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.delivery.findUnique({
        where: { id: input.id },
        include: {
          customer: true,
          purchase: true,
          driver:   { select: { id: true, name: true } },
        },
      });
    }),
});
