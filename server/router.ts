import { router, publicProcedure } from './trpc';
import { customersRouter } from './routers/customers';
import { purchasesRouter } from './routers/purchases';
import { orgsRouter } from './routers/orgs';

export const appRouter = router({
  healthcheck: publicProcedure.query(() => ({ ok: true })),
  customers: customersRouter,
  purchases: purchasesRouter,
  orgs: orgsRouter,
});

export type AppRouter = typeof appRouter;
