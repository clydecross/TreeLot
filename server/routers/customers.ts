import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { router, publicProcedure } from '../trpc';

type SearchRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  seasonsCount: number;
  lastPurchaseAt: Date | null;
  lastTreeType: string | null;
  lastTreeSize: string | null;
  lastTotalCents: number | null;
};

export const customersRouter = router({
  // ── customers.search ──────────────────────────────────────────────────────
  search: publicProcedure
    .input(z.object({ query: z.string(), orgId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { query, orgId } = input;
      const trimmed = query.trim();

      // Empty query returns nothing (caller shows placeholder)
      if (!trimmed) return [];

      const likeParam = `%${trimmed}%`;

      const rows = await ctx.db.$queryRaw<SearchRow[]>`
        SELECT
          c.id,
          c."firstName",
          c."lastName",
          c.phone,
          c.email,
          COUNT(DISTINCT p."seasonYear")::int AS "seasonsCount",
          MAX(p."purchasedAt")               AS "lastPurchaseAt",
          MAX(p."treeType")                  AS "lastTreeType",
          MAX(p."treeSizeRange")             AS "lastTreeSize",
          MAX(p."totalCents")                AS "lastTotalCents"
        FROM customers c
        LEFT JOIN purchases p ON p."customerId" = c.id
        WHERE c."orgId" = ${orgId}::uuid
          AND (
            (
              c."firstName" || ' ' || c."lastName" || ' '
                || COALESCE(c.phone, '') || ' '
                || COALESCE(c.email, '')
            ) % ${trimmed}
            OR c."firstName" ILIKE ${likeParam}
            OR c."lastName"  ILIKE ${likeParam}
            OR c.phone        ILIKE ${likeParam}
            OR c.email        ILIKE ${likeParam}
          )
        GROUP BY c.id, c."firstName", c."lastName", c.phone, c.email
        ORDER BY similarity(
          c."firstName" || ' ' || c."lastName" || ' '
            || COALESCE(c.phone, '') || ' '
            || COALESCE(c.email, ''),
          ${trimmed}
        ) DESC
        LIMIT 10
      `;

      return rows.map((r) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        email: r.email,
        seasonsCount: r.seasonsCount,
        lastPurchaseAt: r.lastPurchaseAt?.toISOString() ?? null,
        lastTreeType: r.lastTreeType,
        lastTreeSize: r.lastTreeSize,
        lastTotalCents: r.lastTotalCents,
      }));
    }),

  // ── customers.getById ──────────────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid(), orgId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const customer = await ctx.db.customer.findFirst({
        where: { id: input.id, orgId: input.orgId },
        include: {
          purchases: {
            orderBy: { seasonYear: 'desc' },
            include: { delivery: true },
          },
        },
      });
      return customer;
    }),

  // ── customers.create ──────────────────────────────────────────────────────
  create: publicProcedure
    .input(
      z.object({
        orgId:        z.string().uuid(),
        firstName:    z.string().min(1),
        lastName:     z.string().min(1),
        phone:        z.string().min(1),
        email:        z.string().email().optional(),
        addressLine1: z.string().optional(),
        city:         z.string().optional(),
        state:        z.string().optional(),
        zip:          z.string().optional(),
        notes:        z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.db.customer.create({
        data: {
          orgId:        input.orgId,
          firstName:    input.firstName,
          lastName:     input.lastName,
          phone:        input.phone,
          email:        input.email ?? null,
          addressLine1: input.addressLine1 ?? null,
          city:         input.city ?? null,
          state:        input.state ?? null,
          zip:          input.zip ?? null,
          notes:        input.notes ?? null,
        },
      });
    }),

  // ── customers.update ──────────────────────────────────────────────────────
  update: publicProcedure
    .input(
      z.object({
        id:           z.string().uuid(),
        orgId:        z.string().uuid(),
        firstName:    z.string().min(1).optional(),
        lastName:     z.string().min(1).optional(),
        phone:        z.string().min(1).optional(),
        email:        z.string().email().nullable().optional(),
        addressLine1: z.string().nullable().optional(),
        city:         z.string().nullable().optional(),
        state:        z.string().nullable().optional(),
        zip:          z.string().nullable().optional(),
        notes:        z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, orgId, ...data } = input;
      // Verify org ownership before mutating
      const existing = await ctx.db.customer.findFirst({
        where: { id, orgId },
        select: { id: true },
      });
      if (!existing) throw new Error('Customer not found');

      return ctx.db.customer.update({
        where: { id },
        data,
      });
    }),
});
