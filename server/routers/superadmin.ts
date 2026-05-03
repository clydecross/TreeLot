import { router, superadminProcedure } from '../trpc';

export const superadminRouter = router({
  listOrgs: superadminProcedure.query(async ({ ctx }) => {
    const orgs = await ctx.db.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        name:      true,
        plan:      true,
        createdAt: true,
        _count: {
          select: { locations: true, users: true, customers: true },
        },
        locations: {
          select: {
            _count: { select: { purchases: true } },
          },
        },
      },
    });

    return orgs.map(({ locations, _count, ...org }) => ({
      ...org,
      locationCount:  _count.locations,
      userCount:      _count.users,
      customerCount:  _count.customers,
      purchaseCount:  locations.reduce((sum, l) => sum + l._count.purchases, 0),
    }));
  }),
});
