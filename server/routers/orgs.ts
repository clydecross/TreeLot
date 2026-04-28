import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const orgsRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.organization.findFirst({
        where: { id: input.id },
        select: { id: true, name: true, taxRateBps: true },
      });
    }),
});
