import { z } from 'zod';
import { router, staffProcedure } from '../trpc';

export const shiftRouter = router({
  // ── Today's snapshot (X report style) ──────────────────────────────────────
  summary: staffProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) {
        throw new Error('Your account is not assigned to a location.');
      }
      const locationId = ctx.user.locationId;

      const loc = await ctx.db.location.findFirst({
        where: { id: locationId, orgId: ctx.user.orgId },
        select: { id: true, name: true, timezone: true },
      });
      if (!loc) throw new Error('Location not found in your org');

      // Date range (UTC for MVP — timezone-correct in Phase 9)
      const dayStart = new Date(`${input.date}T00:00:00.000Z`);
      const dayEnd   = new Date(`${input.date}T23:59:59.999Z`);

      const purchases = await ctx.db.purchase.findMany({
        where: {
          locationId,
          purchasedAt: { gte: dayStart, lte: dayEnd },
        },
        include: {
          customer:  { select: { firstName: true, lastName: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { purchasedAt: 'asc' },
      });

      const totals = {
        revenueCents:  purchases.reduce((s, p) => s + p.totalCents, 0),
        subtotalCents: purchases.reduce((s, p) => s + p.subtotalCents, 0),
        taxCents:      purchases.reduce((s, p) => s + p.taxCents, 0),
        transactions:  purchases.length,
        avgOrderCents: 0,
        cashCents:     purchases.filter((p) => p.paymentMethod === 'cash').reduce((s, p) => s + p.totalCents, 0),
        cardCents:     purchases.filter((p) => p.paymentMethod === 'card').reduce((s, p) => s + p.totalCents, 0),
        venmoCents:    purchases.filter((p) => p.paymentMethod === 'venmo').reduce((s, p) => s + p.totalCents, 0),
        zelleCents:    purchases.filter((p) => p.paymentMethod === 'zelle').reduce((s, p) => s + p.totalCents, 0),
        cashCount:     purchases.filter((p) => p.paymentMethod === 'cash').length,
        cardCount:     purchases.filter((p) => p.paymentMethod === 'card').length,
        venmoCount:    purchases.filter((p) => p.paymentMethod === 'venmo').length,
        zelleCount:    purchases.filter((p) => p.paymentMethod === 'zelle').length,
        deliveryCount: purchases.filter((p) => p.deliveryRequested).length,
      };
      totals.avgOrderCents =
        totals.transactions > 0 ? Math.round(totals.revenueCents / totals.transactions) : 0;

      // Per-staff breakdown
      const staffMap = new Map<
        string,
        { id: string; name: string; transactions: number; revenueCents: number }
      >();
      for (const p of purchases) {
        const existing =
          staffMap.get(p.createdBy.id) ?? {
            id: p.createdBy.id,
            name: p.createdBy.name,
            transactions: 0,
            revenueCents: 0,
          };
        existing.transactions += 1;
        existing.revenueCents += p.totalCents;
        staffMap.set(p.createdBy.id, existing);
      }
      const staffBreakdown = Array.from(staffMap.values()).sort(
        (a, b) => b.revenueCents - a.revenueCents,
      );

      // Transaction log
      const transactions = purchases.map((p) => ({
        id:                p.id,
        time:              p.purchasedAt.toISOString(),
        customerName:      `${p.customer.firstName} ${p.customer.lastName}`,
        treeType:          p.treeType,
        treeSizeRange:     p.treeSizeRange,
        totalCents:        p.totalCents,
        paymentMethod:     p.paymentMethod,
        staffName:         p.createdBy.name,
        deliveryRequested: p.deliveryRequested,
      }));

      return {
        location: loc,
        date:     input.date,
        totals,
        staffBreakdown,
        transactions,
      };
    }),
});
