import { router, staffProcedure } from '../trpc';

export const orgsRouter = router({
  // ── orgs.getCurrent ───────────────────────────────────────────────────────
  // Returns the signed-in user's org. No input — the org is derived from auth.
  getCurrent: staffProcedure.query(async ({ ctx }) => {
    return ctx.db.organization.findFirst({
      where: { id: ctx.user.orgId },
      select: { id: true, name: true, taxRateBps: true },
    });
  }),
});
