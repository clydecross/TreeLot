import { router, publicProcedure } from './trpc';
import { customersRouter } from './routers/customers';
import { purchasesRouter } from './routers/purchases';
import { orgsRouter } from './routers/orgs';
import { deliveriesRouter } from './routers/deliveries';
import { usersRouter } from './routers/users';
import { driversRouter } from './routers/drivers';
import { analyticsRouter } from './routers/analytics';
import { adminRouter } from './routers/admin';
import { shiftRouter } from './routers/shift';

export const appRouter = router({
  healthcheck: publicProcedure.query(() => ({ ok: true })),
  customers:  customersRouter,
  purchases:  purchasesRouter,
  orgs:       orgsRouter,
  deliveries: deliveriesRouter,
  users:      usersRouter,
  drivers:    driversRouter,
  analytics:  analyticsRouter,
  admin:      adminRouter,
  shift:      shiftRouter,
});

export type AppRouter = typeof appRouter;
