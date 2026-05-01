import { z } from 'zod';
import { router, managerProcedure, ownerProcedure } from '../trpc';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type SummaryRow = {
  revenueCents: bigint | null;
  transactions: bigint;
  cashCount: bigint;
  cardCount: bigint;
  venmoCount: bigint;
  zelleCount: bigint;
  deliveryCount: bigint;
  standCount: bigint;
  lightsCount: bigint;
};

type TopValueRow = { value: string | null };

type HourlyRow = {
  hour: number;
  revenueCents: bigint | null;
  transactions: bigint;
};

type DailyRow = {
  date: Date;
  revenueCents: bigint | null;
  transactions: bigint;
};

type TopCustomerRow = {
  customerId: string;
  firstName: string;
  lastName: string;
  totalCents: bigint | null;
  purchaseCount: bigint;
};

type TreeTypeRow = {
  treeType: string;
  revenueCents: bigint | null;
  count: bigint;
};

type SizeRow = {
  treeSizeRange: string;
  revenueCents: bigint | null;
  count: bigint;
};

function n(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const analyticsRouter = router({
  // ── analytics.summary ─────────────────────────────────────────────────────
  summary: managerProcedure
    .input(
      z.object({
        dateFrom: dateString,
        dateTo:   dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) {
        return {
          revenueCents: 0, transactions: 0, avgOrderCents: 0,
          cashCount: 0, cardCount: 0, venmoCount: 0, zelleCount: 0, deliveryCount: 0,
          standAttachRate: 0, lightsAttachRate: 0,
          topTreeType: '—', topSize: '—',
        };
      }
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo } = input;

      const rows = await ctx.db.$queryRaw<SummaryRow[]>`
        SELECT
          COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents",
          COUNT(*)::bigint                       AS "transactions",
          COUNT(*) FILTER (WHERE "paymentMethod" = 'cash')::bigint  AS "cashCount",
          COUNT(*) FILTER (WHERE "paymentMethod" = 'card')::bigint  AS "cardCount",
          COUNT(*) FILTER (WHERE "paymentMethod" = 'venmo')::bigint AS "venmoCount",
          COUNT(*) FILTER (WHERE "paymentMethod" = 'zelle')::bigint AS "zelleCount",
          COUNT(*) FILTER (WHERE "deliveryRequested" = true)::bigint AS "deliveryCount",
          COUNT(*) FILTER (WHERE "standIncluded" = true)::bigint     AS "standCount",
          COUNT(*) FILTER (WHERE "lightsIncluded" = true)::bigint    AS "lightsCount"
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${dateFrom}::timestamptz
          AND "purchasedAt" < (${dateTo}::date + 1)::timestamptz
      `;

      const r = rows[0];
      const transactions = n(r?.transactions);
      const revenueCents = n(r?.revenueCents);
      const standCount   = n(r?.standCount);
      const lightsCount  = n(r?.lightsCount);

      const topTreeRows = await ctx.db.$queryRaw<TopValueRow[]>`
        SELECT "treeType" AS value
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${dateFrom}::timestamptz
          AND "purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY "treeType"
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

      const topSizeRows = await ctx.db.$queryRaw<TopValueRow[]>`
        SELECT "treeSizeRange" AS value
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${dateFrom}::timestamptz
          AND "purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY "treeSizeRange"
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

      return {
        revenueCents,
        transactions,
        avgOrderCents:    transactions === 0 ? 0 : Math.round(revenueCents / transactions),
        cashCount:        n(r?.cashCount),
        cardCount:        n(r?.cardCount),
        venmoCount:       n(r?.venmoCount),
        zelleCount:       n(r?.zelleCount),
        deliveryCount:    n(r?.deliveryCount),
        standAttachRate:  transactions === 0 ? 0 : standCount / transactions,
        lightsAttachRate: transactions === 0 ? 0 : lightsCount / transactions,
        topTreeType:      topTreeRows[0]?.value ?? '—',
        topSize:          topSizeRows[0]?.value ?? '—',
      };
    }),

  // ── analytics.hourlySales ─────────────────────────────────────────────────
  hourlySales: managerProcedure
    .input(z.object({ date: dateString }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { date } = input;

      const rows = await ctx.db.$queryRaw<HourlyRow[]>`
        SELECT
          h.hour::int AS hour,
          COALESCE(SUM(p."totalCents"), 0)::bigint AS "revenueCents",
          COUNT(p.id)::bigint                      AS transactions
        FROM generate_series(0, 23) AS h(hour)
        LEFT JOIN purchases p
          ON EXTRACT(HOUR FROM p."purchasedAt" AT TIME ZONE 'UTC') = h.hour
          AND p."locationId" = ${locationId}::uuid
          AND p."purchasedAt" >= ${date}::timestamptz
          AND p."purchasedAt" < (${date}::date + 1)::timestamptz
        GROUP BY h.hour
        ORDER BY h.hour ASC
      `;

      return rows.map((r) => ({
        hour: Number(r.hour),
        revenueCents: n(r.revenueCents),
        transactions: n(r.transactions),
      }));
    }),

  // ── analytics.dailySales ──────────────────────────────────────────────────
  dailySales: managerProcedure
    .input(
      z.object({
        dateFrom: dateString,
        dateTo:   dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo } = input;

      const rows = await ctx.db.$queryRaw<DailyRow[]>`
        SELECT
          d.day AS date,
          COALESCE(SUM(p."totalCents"), 0)::bigint AS "revenueCents",
          COUNT(p.id)::bigint                      AS transactions
        FROM generate_series(${dateFrom}::date, ${dateTo}::date, '1 day'::interval) AS d(day)
        LEFT JOIN purchases p
          ON DATE(p."purchasedAt" AT TIME ZONE 'UTC') = d.day::date
          AND p."locationId" = ${locationId}::uuid
        GROUP BY d.day
        ORDER BY d.day ASC
      `;

      return rows.map((r) => ({
        date: ymd(r.date),
        revenueCents: n(r.revenueCents),
        transactions: n(r.transactions),
      }));
    }),

  // ── analytics.topCustomers ────────────────────────────────────────────────
  topCustomers: managerProcedure
    .input(
      z.object({
        dateFrom: dateString,
        dateTo:   dateString,
        limit:    z.number().int().min(1).max(100).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo, limit } = input;

      const rows = await ctx.db.$queryRaw<TopCustomerRow[]>`
        SELECT
          c.id                                    AS "customerId",
          c."firstName"                           AS "firstName",
          c."lastName"                            AS "lastName",
          COALESCE(SUM(p."totalCents"), 0)::bigint AS "totalCents",
          COUNT(p.id)::bigint                     AS "purchaseCount"
        FROM customers c
        JOIN purchases p ON p."customerId" = c.id
        WHERE p."locationId" = ${locationId}::uuid
          AND p."purchasedAt" >= ${dateFrom}::timestamptz
          AND p."purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY c.id, c."firstName", c."lastName"
        ORDER BY SUM(p."totalCents") DESC
        LIMIT ${limit}
      `;

      return rows.map((r) => ({
        customerId:    r.customerId,
        firstName:     r.firstName,
        lastName:      r.lastName,
        totalCents:    n(r.totalCents),
        purchaseCount: n(r.purchaseCount),
      }));
    }),

  // ── analytics.byTreeType ──────────────────────────────────────────────────
  byTreeType: managerProcedure
    .input(
      z.object({
        dateFrom: dateString,
        dateTo:   dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo } = input;

      const rows = await ctx.db.$queryRaw<TreeTypeRow[]>`
        SELECT
          "treeType",
          COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents",
          COUNT(*)::bigint                       AS count
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${dateFrom}::timestamptz
          AND "purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY "treeType"
        ORDER BY SUM("totalCents") DESC
      `;

      return rows.map((r) => ({
        treeType: r.treeType,
        revenueCents: n(r.revenueCents),
        count: n(r.count),
      }));
    }),

  // ── analytics.bySize ──────────────────────────────────────────────────────
  bySize: managerProcedure
    .input(
      z.object({
        dateFrom: dateString,
        dateTo:   dateString,
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo } = input;

      const rows = await ctx.db.$queryRaw<SizeRow[]>`
        SELECT
          "treeSizeRange",
          COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents",
          COUNT(*)::bigint                       AS count
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${dateFrom}::timestamptz
          AND "purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY "treeSizeRange"
        ORDER BY SUM("totalCents") DESC
      `;

      return rows.map((r) => ({
        treeSizeRange: r.treeSizeRange,
        revenueCents: n(r.revenueCents),
        count: n(r.count),
      }));
    }),

  // ── analytics.seasonComparison ────────────────────────────────────────────
  // Past 5 seasons side-by-side. Uses a CTE that flags each customer's
  // first-purchase season so we can compute new vs returning customers.
  seasonComparison: ownerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;

      const rows = await ctx.db.$queryRaw<
        {
          seasonYear: number;
          revenueCents: bigint | null;
          transactions: bigint;
          deliveryCount: bigint;
          uniqueCustomers: bigint;
          newCustomers: bigint;
          returningCustomers: bigint;
        }[]
      >`
        WITH customer_first_season AS (
          SELECT "customerId", MIN("seasonYear") AS first_season
          FROM purchases
          WHERE "locationId" = ${locationId}::uuid
          GROUP BY "customerId"
        ),
        season_customers AS (
          SELECT DISTINCT p."seasonYear", p."customerId", cfs.first_season
          FROM purchases p
          JOIN customer_first_season cfs ON cfs."customerId" = p."customerId"
          WHERE p."locationId" = ${locationId}::uuid
        )
        SELECT
          p."seasonYear"                                          AS "seasonYear",
          COALESCE(SUM(p."totalCents"), 0)::bigint                AS "revenueCents",
          COUNT(*)::bigint                                        AS "transactions",
          COUNT(*) FILTER (WHERE p."deliveryRequested" = true)::bigint AS "deliveryCount",
          (SELECT COUNT(*)::bigint FROM season_customers sc
            WHERE sc."seasonYear" = p."seasonYear")               AS "uniqueCustomers",
          (SELECT COUNT(*)::bigint FROM season_customers sc
            WHERE sc."seasonYear" = p."seasonYear"
              AND sc.first_season = p."seasonYear")               AS "newCustomers",
          (SELECT COUNT(*)::bigint FROM season_customers sc
            WHERE sc."seasonYear" = p."seasonYear"
              AND sc.first_season < p."seasonYear")               AS "returningCustomers"
        FROM purchases p
        WHERE p."locationId" = ${locationId}::uuid
        GROUP BY p."seasonYear"
        ORDER BY p."seasonYear" DESC
        LIMIT 5
      `;

      return rows
        .map((r) => {
          const revenueCents = n(r.revenueCents);
          const transactions = n(r.transactions);
          const deliveryCount = n(r.deliveryCount);
          return {
            seasonYear:        Number(r.seasonYear),
            revenueCents,
            transactions,
            avgOrderCents:     transactions === 0 ? 0 : Math.round(revenueCents / transactions),
            deliveryCount,
            deliveryRate:      transactions === 0 ? 0 : deliveryCount / transactions,
            uniqueCustomers:   n(r.uniqueCustomers),
            newCustomers:      n(r.newCustomers),
            returningCustomers: n(r.returningCustomers),
          };
        })
        .reverse(); // chronological order for charts
    }),

  // ── analytics.cohortRetention ─────────────────────────────────────────────
  // Customer retention matrix: rows = first-purchase season, cols = subsequent
  // seasons. retention[seasonYear] is % of cohortSize that bought that year.
  cohortRetention: ownerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.locationId) return [] as { cohortSeason: number; cohortSize: number; retention: Record<number, number> }[];
      const locationId = ctx.user.locationId;

      // (cohortSeason, seasonYear, customers in that cohort who bought in that
      // seasonYear). The diagonal cell is the cohortSize itself.
      const rows = await ctx.db.$queryRaw<
        {
          cohortSeason: number;
          seasonYear: number;
          customers: bigint;
        }[]
      >`
        WITH customer_first_season AS (
          SELECT "customerId", MIN("seasonYear") AS first_season
          FROM purchases
          WHERE "locationId" = ${locationId}::uuid
          GROUP BY "customerId"
        ),
        recent_cohorts AS (
          SELECT DISTINCT first_season
          FROM customer_first_season
          ORDER BY first_season DESC
          LIMIT 5
        ),
        customer_seasons AS (
          SELECT DISTINCT p."customerId", p."seasonYear", cfs.first_season
          FROM purchases p
          JOIN customer_first_season cfs ON cfs."customerId" = p."customerId"
          WHERE p."locationId" = ${locationId}::uuid
            AND cfs.first_season IN (SELECT first_season FROM recent_cohorts)
        )
        SELECT
          cs.first_season::int AS "cohortSeason",
          cs."seasonYear"::int AS "seasonYear",
          COUNT(DISTINCT cs."customerId")::bigint AS customers
        FROM customer_seasons cs
        WHERE cs."seasonYear" >= cs.first_season
        GROUP BY cs.first_season, cs."seasonYear"
        ORDER BY cs.first_season ASC, cs."seasonYear" ASC
      `;

      // Cohort sizes (the diagonal cell)
      const cohortSizes = new Map<number, number>();
      for (const r of rows) {
        if (Number(r.cohortSeason) === Number(r.seasonYear)) {
          cohortSizes.set(Number(r.cohortSeason), n(r.customers));
        }
      }

      // Group rows by cohortSeason
      const byCohort = new Map<number, Map<number, number>>();
      for (const r of rows) {
        const cohort = Number(r.cohortSeason);
        const yr     = Number(r.seasonYear);
        if (!byCohort.has(cohort)) byCohort.set(cohort, new Map());
        byCohort.get(cohort)!.set(yr, n(r.customers));
      }

      const cohortSeasons = Array.from(byCohort.keys()).sort((a, b) => a - b);
      return cohortSeasons.map((cohortSeason) => {
        const cohortSize = cohortSizes.get(cohortSeason) ?? 0;
        const counts = byCohort.get(cohortSeason)!;
        const retention: Record<number, number> = {};
        for (const [yr, count] of counts.entries()) {
          retention[yr] = cohortSize === 0 ? 0 : Math.round((count / cohortSize) * 1000) / 10;
        }
        return { cohortSeason, cohortSize, retention };
      });
    }),

  // ── analytics.ltvDistribution ─────────────────────────────────────────────
  // Customer LTV bucket distribution + percentile-driven concentration stats.
  ltvDistribution: ownerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.locationId) {
        return {
          buckets: [
            { minCents: 0,      maxCents: 10000,                  label: '$0–100',   count: 0 },
            { minCents: 10001,  maxCents: 25000,                  label: '$100–250', count: 0 },
            { minCents: 25001,  maxCents: 50000,                  label: '$250–500', count: 0 },
            { minCents: 50001,  maxCents: 100000,                 label: '$500–1k',  count: 0 },
            { minCents: 100001, maxCents: Number.MAX_SAFE_INTEGER, label: '$1k+',    count: 0 },
          ],
          totalCustomers:     0,
          medianLtv:          0,
          top10pctRevenue:    0,
          bottom50pctRevenue: 0,
        };
      }
      const locationId = ctx.user.locationId;

      const rows = await ctx.db.$queryRaw<{ ltv: bigint }[]>`
        SELECT COALESCE(SUM("totalCents"), 0)::bigint AS ltv
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
        GROUP BY "customerId"
        HAVING COALESCE(SUM("totalCents"), 0) > 0
        ORDER BY SUM("totalCents") DESC
      `;

      const ltvs = rows.map((r) => n(r.ltv)); // sorted DESC
      const totalCustomers = ltvs.length;
      const totalRevenue   = ltvs.reduce((a, b) => a + b, 0);

      const buckets = [
        { minCents: 0,      maxCents: 10000,        label: '$0–100',       count: 0 },
        { minCents: 10001,  maxCents: 25000,        label: '$100–250',     count: 0 },
        { minCents: 25001,  maxCents: 50000,        label: '$250–500',     count: 0 },
        { minCents: 50001,  maxCents: 100000,       label: '$500–1k',      count: 0 },
        { minCents: 100001, maxCents: Number.MAX_SAFE_INTEGER, label: '$1k+', count: 0 },
      ];
      for (const v of ltvs) {
        const bucket = buckets.find((b) => v >= b.minCents && v <= b.maxCents);
        if (bucket) bucket.count += 1;
      }

      // median (sorted DESC, so flip to ASC for clarity)
      const asc = [...ltvs].sort((a, b) => a - b);
      let medianLtv = 0;
      if (asc.length > 0) {
        const mid = Math.floor(asc.length / 2);
        medianLtv = asc.length % 2 === 0
          ? Math.round((asc[mid - 1] + asc[mid]) / 2)
          : asc[mid];
      }

      // top10pctRevenue = % of total revenue from top 10% of customers by spend
      const top10Count = Math.max(1, Math.ceil(totalCustomers * 0.1));
      const top10Sum   = ltvs.slice(0, Math.min(top10Count, ltvs.length))
                             .reduce((a, b) => a + b, 0);
      // bottom 50% by spend = bottom of DESC-sorted list
      const bottom50Count = Math.floor(totalCustomers * 0.5);
      const bottom50Sum   = ltvs.slice(ltvs.length - bottom50Count)
                                .reduce((a, b) => a + b, 0);

      const pct = (n: number) =>
        totalRevenue === 0 ? 0 : Math.round((n / totalRevenue) * 1000) / 10;

      return {
        buckets,
        totalCustomers,
        medianLtv,
        top10pctRevenue:    pct(top10Sum),
        bottom50pctRevenue: pct(bottom50Sum),
      };
    }),

  // ── analytics.forecast ────────────────────────────────────────────────────
  // Simple paced projection vs prior season same-period.
  forecast: ownerProcedure
    .input(z.object({ seasonYear: z.number().int() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) {
        return {
          actualRevenueCents:             0,
          actualTransactions:             0,
          lastYearSamePeriodRevenueCents: 0,
          lastYearTotalRevenueCents:      0,
          projectedRevenueCents:          0,
          daysRemaining:                  0,
          paceVsLastYear:                 0,
        };
      }
      const locationId = ctx.user.locationId;
      const { seasonYear } = input;

      const seasonStart = `${seasonYear}-11-01`;
      const seasonEnd   = `${seasonYear}-12-24`;       // inclusive end-of-season
      const lastStart   = `${seasonYear - 1}-11-01`;
      const lastEnd     = `${seasonYear - 1}-12-24`;

      // "Same period" = same MM-DD in prior year, today (UTC).
      const today  = new Date();
      const todayStr     = ymd(today);
      const mmdd         = todayStr.slice(5);          // "MM-DD"
      const lastSamePeriodEnd = `${seasonYear - 1}-${mmdd}`;

      // Current season-to-date
      const cur = await ctx.db.$queryRaw<
        { revenueCents: bigint | null; transactions: bigint }[]
      >`
        SELECT
          COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents",
          COUNT(*)::bigint                       AS "transactions"
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${seasonStart}::timestamptz
          AND "purchasedAt" < (${seasonEnd}::date + 1)::timestamptz
      `;
      const actualRevenueCents = n(cur[0]?.revenueCents);
      const actualTransactions = n(cur[0]?.transactions);

      // Prior season same period (Nov 1 → today's MM-DD in last year)
      const lastSame = await ctx.db.$queryRaw<
        { revenueCents: bigint | null }[]
      >`
        SELECT COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents"
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${lastStart}::timestamptz
          AND "purchasedAt" < (${lastSamePeriodEnd}::date + 1)::timestamptz
      `;
      const lastYearSamePeriodRevenueCents = n(lastSame[0]?.revenueCents);

      // Prior season full
      const lastFull = await ctx.db.$queryRaw<
        { revenueCents: bigint | null }[]
      >`
        SELECT COALESCE(SUM("totalCents"), 0)::bigint AS "revenueCents"
        FROM purchases
        WHERE "locationId" = ${locationId}::uuid
          AND "purchasedAt" >= ${lastStart}::timestamptz
          AND "purchasedAt" < (${lastEnd}::date + 1)::timestamptz
      `;
      const lastYearTotalRevenueCents = n(lastFull[0]?.revenueCents);

      const projectedRevenueCents =
        lastYearSamePeriodRevenueCents === 0
          ? 0
          : Math.round(
              actualRevenueCents *
                (lastYearTotalRevenueCents / lastYearSamePeriodRevenueCents)
            );

      const paceVsLastYear =
        lastYearSamePeriodRevenueCents === 0
          ? 0
          : actualRevenueCents / lastYearSamePeriodRevenueCents - 1;

      // Days remaining until Dec 24 of this season (UTC, inclusive of today)
      const endOfSeason = new Date(`${seasonEnd}T00:00:00Z`);
      const todayUtc    = new Date(`${todayStr}T00:00:00Z`);
      const msPerDay    = 86_400_000;
      const daysRemaining = Math.max(
        0,
        Math.ceil((endOfSeason.getTime() - todayUtc.getTime()) / msPerDay),
      );

      return {
        actualRevenueCents,
        actualTransactions,
        lastYearSamePeriodRevenueCents,
        lastYearTotalRevenueCents,
        projectedRevenueCents,
        daysRemaining,
        paceVsLastYear,
      };
    }),

  // ── analytics.staffProductivity ───────────────────────────────────────────
  // Per-staff revenue, sorted desc.
  staffProductivity: ownerProcedure
    .input(z.object({
      dateFrom: dateString,
      dateTo:   dateString,
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.locationId) return [];
      const locationId = ctx.user.locationId;
      const { dateFrom, dateTo } = input;

      const rows = await ctx.db.$queryRaw<
        {
          userId: string;
          name: string;
          transactions: bigint;
          revenueCents: bigint | null;
        }[]
      >`
        SELECT
          u.id                                       AS "userId",
          u.name                                     AS name,
          COUNT(p.id)::bigint                        AS transactions,
          COALESCE(SUM(p."totalCents"), 0)::bigint   AS "revenueCents"
        FROM users u
        JOIN purchases p ON p."createdById" = u.id
        WHERE p."locationId" = ${locationId}::uuid
          AND p."purchasedAt" >= ${dateFrom}::timestamptz
          AND p."purchasedAt" < (${dateTo}::date + 1)::timestamptz
        GROUP BY u.id, u.name
        ORDER BY SUM(p."totalCents") DESC
      `;

      return rows.map((r) => {
        const transactions = n(r.transactions);
        const revenueCents = n(r.revenueCents);
        return {
          userId:        r.userId,
          name:          r.name,
          transactions,
          revenueCents,
          avgOrderCents: transactions === 0 ? 0 : Math.round(revenueCents / transactions),
        };
      });
    }),
});
