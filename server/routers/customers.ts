import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { router, staffProcedure } from '../trpc';

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

type ListRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  purchaseCount: number;
  lifetimeCents: number;
  lastPurchaseAt: Date | null;
  lastTreeType: string | null;
  lastTreeSize: string | null;
};

export const customersRouter = router({
  // ── customers.list ────────────────────────────────────────────────────────
  // Paginated browse — sorted by most recent activity (or lifetime spend).
  list: staffProcedure
    .input(
      z.object({
        sort:   z.enum(['recent', 'lifetime', 'name']).default('recent'),
        limit:  z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const orgId = ctx.user.orgId;
      const { sort, limit, offset } = input;
      const orderBySql =
        sort === 'lifetime'
          ? Prisma.sql`COALESCE(SUM(p."totalCents"), 0) DESC NULLS LAST`
          : sort === 'name'
          ? Prisma.sql`c."lastName" ASC, c."firstName" ASC`
          : Prisma.sql`MAX(p."purchasedAt") DESC NULLS LAST, c."createdAt" DESC`;

      const rows = await ctx.db.$queryRaw<ListRow[]>`
        SELECT
          c.id,
          c."firstName",
          c."lastName",
          c.phone,
          c.email,
          c.city,
          c.state,
          COUNT(p.id)::int                        AS "purchaseCount",
          COALESCE(SUM(p."totalCents"), 0)::int   AS "lifetimeCents",
          MAX(p."purchasedAt")                    AS "lastPurchaseAt",
          (ARRAY_AGG(p."treeType"      ORDER BY p."purchasedAt" DESC) FILTER (WHERE p.id IS NOT NULL))[1] AS "lastTreeType",
          (ARRAY_AGG(p."treeSizeRange" ORDER BY p."purchasedAt" DESC) FILTER (WHERE p.id IS NOT NULL))[1] AS "lastTreeSize"
        FROM customers c
        LEFT JOIN purchases p ON p."customerId" = c.id
        WHERE c."orgId" = ${orgId}::uuid
        GROUP BY c.id, c."firstName", c."lastName", c.phone, c.email, c.city, c.state, c."createdAt"
        ORDER BY ${orderBySql}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const totalRow = await ctx.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM customers WHERE "orgId" = ${orgId}::uuid
      `;

      return {
        rows: rows.map((r) => ({
          id:             r.id,
          firstName:      r.firstName,
          lastName:       r.lastName,
          phone:          r.phone,
          email:          r.email,
          city:           r.city,
          state:          r.state,
          purchaseCount:  r.purchaseCount,
          lifetimeCents:  r.lifetimeCents,
          lastPurchaseAt: r.lastPurchaseAt?.toISOString() ?? null,
          lastTreeType:   r.lastTreeType,
          lastTreeSize:   r.lastTreeSize,
        })),
        total: Number(totalRow[0]?.count ?? 0),
      };
    }),

  // ── customers.search ──────────────────────────────────────────────────────
  search: staffProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const orgId = ctx.user.orgId;
      const trimmed = input.query.trim();
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
  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const customer = await ctx.db.customer.findFirst({
        where: { id: input.id, orgId: ctx.user.orgId },
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
  create: staffProcedure
    .input(
      z.object({
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
          orgId:        ctx.user.orgId,
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
  update: staffProcedure
    .input(
      z.object({
        id:           z.string().uuid(),
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
      const { id, ...data } = input;

      // Verify the customer belongs to the user's org before mutating.
      const existing = await ctx.db.customer.findFirst({
        where: { id, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      return ctx.db.customer.update({
        where: { id },
        data,
      });
    }),
});
