import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, staffProcedure } from '../trpc';

export const purchasesRouter = router({
  create: staffProcedure
    .input(
      z.object({
        customerId:        z.string().uuid(),
        seasonYear:        z.number().int().min(2000).max(2100),
        treeType:          z.string().min(1),
        treeTypeName:      z.string().optional(),
        treeSizeRange:     z.string().min(1),
        subtotalCents:     z.number().int().min(1),
        taxRateBps:        z.number().int().min(0),
        paymentMethod:     z.enum(['cash', 'card', 'venmo', 'zelle']),
        standIncluded:     z.boolean(),
        lightsIncluded:    z.boolean(),
        deliveryRequested: z.boolean(),
        notes:             z.string().optional(),
        delivery: z
          .object({
            addressLine1:        z.string().min(1),
            city:                z.string().min(1),
            state:               z.string().min(1),
            zip:                 z.string().min(1),
            deliveryDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            timeWindow:          z.enum(['morning', 'afternoon', 'evening', 'anytime']),
            installRequested:    z.boolean().optional(),
            specialInstructions: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Staff must be assigned to a location before they can ring up a sale.
      if (!ctx.user.locationId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Your account is not assigned to a location.',
        });
      }
      const locationId  = ctx.user.locationId;
      const createdById = ctx.user.id;

      // Verify the customer belongs to the user's org.
      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!customer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      const taxCents   = Math.round((input.subtotalCents * input.taxRateBps) / 10000);
      const totalCents = input.subtotalCents + taxCents;
      const now = new Date();

      return ctx.db.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
          data: {
            customerId:        input.customerId,
            locationId,
            createdById,
            seasonYear:        input.seasonYear,
            treeType:          input.treeType,
            treeTypeName:      input.treeTypeName ?? null,
            treeSizeRange:     input.treeSizeRange,
            subtotalCents:     input.subtotalCents,
            taxCents,
            totalCents,
            paymentMethod:     input.paymentMethod,
            standIncluded:     input.standIncluded,
            lightsIncluded:    input.lightsIncluded,
            deliveryRequested: input.deliveryRequested,
            notes:             input.notes ?? null,
            purchasedAt:       now,
          },
        });

        let delivery = null;
        if (input.deliveryRequested && input.delivery) {
          const d = input.delivery;
          delivery = await tx.delivery.create({
            data: {
              purchaseId:          purchase.id,
              customerId:          input.customerId,
              locationId,
              addressLine1:        d.addressLine1,
              city:                d.city,
              state:               d.state,
              zip:                 d.zip,
              deliveryDate:        new Date(d.deliveryDate),
              timeWindow:          d.timeWindow,
              standIncluded:       input.standIncluded,
              lightsIncluded:      input.lightsIncluded,
              installRequested:    d.installRequested ?? false,
              specialInstructions: d.specialInstructions ?? null,
              status:              'unassigned',
            },
          });
        }

        return { purchase, delivery };
      });
    }),
});
