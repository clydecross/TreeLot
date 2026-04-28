import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const purchasesRouter = router({
  create: publicProcedure
    .input(
      z.object({
        customerId:        z.string().uuid(),
        locationId:        z.string().uuid(),
        createdById:       z.string().uuid(),
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
      const taxCents = Math.round((input.subtotalCents * input.taxRateBps) / 10000);
      const totalCents = input.subtotalCents + taxCents;
      const now = new Date();

      return ctx.db.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
          data: {
            customerId:        input.customerId,
            locationId:        input.locationId,
            createdById:       input.createdById,
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
              locationId:          input.locationId,
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
