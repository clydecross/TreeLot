'use client';

import { useMemo } from 'react';
import { Chart, registerables, type ChartData } from 'chart.js';
import { Bar, Chart as ReactChart } from 'react-chartjs-2';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

Chart.register(...registerables);
// Chart.js defaults run once at module-load and can't read CSS vars cheaply at
// runtime, so we leave these as literal hex values (data-viz exception).
Chart.defaults.color = '#5F5E5A';
Chart.defaults.borderColor = '#2e2e2a';
Chart.defaults.font.family = 'inherit';
Chart.defaults.plugins.legend.labels.color = '#2D2C29';


function fmt(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function fmtCompact(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return '$' + (dollars / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(dollars) >= 1_000)     return '$' + (dollars / 1_000).toFixed(1) + 'k';
  return '$' + dollars.toFixed(0);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentSeasonRange(): { dateFrom: string; dateTo: string; seasonYear: number } {
  const today = new Date();
  const todayStr = ymdLocal(today);
  // Season starts Nov 1; if we're before Nov 1, the active season's year is last year.
  const seasonYear = today.getMonth() < 10 ? today.getFullYear() - 1 : today.getFullYear();
  return { dateFrom: `${seasonYear}-11-01`, dateTo: todayStr, seasonYear };
}

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-fg-muted">
      {children}
    </div>
  );
}

function KpiSub({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-fg-muted mt-1">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] font-semibold text-fg-default mb-3">
      {children}
    </div>
  );
}

function AccessDenied({ reason }: { reason: string }) {
  return (
    <div className="h-full overflow-y-auto bg-bg-app p-6">
      <Card
        padding="lg"
        className="max-w-[480px] mx-auto mt-20 text-center text-fg-muted"
      >
        <div className="text-[20px] font-semibold text-fg-default">
          Access denied
        </div>
        <div className="text-[13px] text-fg-muted mt-2">
          {reason}
        </div>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const meQ = trpc.users.me.useQuery();

  if (meQ.isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-app">
        <div className="text-fg-muted text-[13px]">Loading…</div>
      </div>
    );
  }

  if (!meQ.data) {
    return <AccessDenied reason="Sign in required" />;
  }

  if (meQ.data.role !== 'owner') {
    return <AccessDenied reason="This page is for owners only" />;
  }

  return <AnalyticsContent />;
}

function AnalyticsContent() {
  const { dateFrom, dateTo, seasonYear } = useMemo(() => currentSeasonRange(), []);

  const summaryQ = trpc.analytics.summary.useQuery({
    dateFrom,
    dateTo,
  });

  const seasonComparisonQ = trpc.analytics.seasonComparison.useQuery();

  const cohortQ = trpc.analytics.cohortRetention.useQuery();

  const ltvQ = trpc.analytics.ltvDistribution.useQuery();

  const forecastQ = trpc.analytics.forecast.useQuery({ seasonYear });

  const seasonRevenueChart = useMemo<ChartData<'bar' | 'line', number[], string>>(() => {
    const data = seasonComparisonQ.data ?? [];
    return {
      labels: data.map((s) => String(s.seasonYear)),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Revenue',
          data: data.map((s) => s.revenueCents / 100),
          backgroundColor: '#7CB542',
          borderColor: '#7CB542',
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Transactions',
          data: data.map((s) => s.transactions),
          borderColor: '#9FE1CB',
          backgroundColor: '#9FE1CB',
          tension: 0.25,
          pointRadius: 4,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    };
  }, [seasonComparisonQ.data]);

  const ltvChart = useMemo(() => {
    const buckets = ltvQ.data?.buckets ?? [];
    return {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: 'Customers',
          data: buckets.map((b) => b.count),
          backgroundColor: '#7CB542',
          borderColor: '#7CB542',
        },
      ],
    };
  }, [ltvQ.data]);

  const pace = forecastQ.data?.paceVsLastYear ?? 0;
  const paceClass = pace >= 0 ? 'text-success-fg' : 'text-error-fg';
  const paceLabel =
    pace === 0
      ? '0%'
      : (pace > 0 ? '+' : '') + (pace * 100).toFixed(1) + '%';

  // Build heatmap matrix
  const cohorts = cohortQ.data ?? [];
  const allSeasons = useMemo(() => {
    const set = new Set<number>();
    for (const c of cohorts) {
      set.add(c.cohortSeason);
      for (const k of Object.keys(c.retention)) set.add(Number(k));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [cohorts]);

  const oldestCohort = cohorts.length > 0 ? cohorts[0] : null;
  const oldestThisSeasonRetention =
    oldestCohort && allSeasons.length > 0
      ? oldestCohort.retention[allSeasons[allSeasons.length - 1]] ?? 0
      : 0;

  const thHeader = 'px-3 py-2 border-b border-border-default font-medium text-fg-muted text-left';
  const tdCell   = 'px-3 py-2.5 border-b border-border-default text-fg-default';

  return (
    <div className="h-full overflow-y-auto bg-bg-app p-6">
      <h1 className="text-[22px] font-semibold text-fg-default m-0">
        Strategic Analytics
      </h1>
      <div className="text-[13px] text-fg-muted mt-1">
        Owner view — season {seasonYear}
      </div>

      {/* KPI HERO ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Card padding="lg">
          <KpiLabel>This Season</KpiLabel>
          <div className="text-2xl font-semibold text-fg-default mt-1.5">
            {fmt(summaryQ.data?.revenueCents ?? 0)}
          </div>
          <KpiSub>{summaryQ.data?.transactions ?? 0} transactions</KpiSub>
        </Card>

        <Card padding="lg">
          <KpiLabel>Pace vs Last Year</KpiLabel>
          <div className={cn('text-2xl font-semibold mt-1.5', paceClass)}>
            {paceLabel}
            <span className="text-[14px] font-normal ml-1.5">
              {pace > 0 ? 'ahead' : pace < 0 ? 'behind' : ''}
            </span>
          </div>
          <KpiSub>
            vs {fmt(forecastQ.data?.lastYearSamePeriodRevenueCents ?? 0)} same-period
          </KpiSub>
        </Card>

        <Card padding="lg">
          <KpiLabel>Projected Total</KpiLabel>
          <div className="text-2xl font-semibold text-fg-default mt-1.5">
            {fmt(forecastQ.data?.projectedRevenueCents ?? 0)}
          </div>
          <KpiSub>
            last year: {fmt(forecastQ.data?.lastYearTotalRevenueCents ?? 0)}
          </KpiSub>
        </Card>

        <Card padding="lg">
          <KpiLabel>Days Remaining</KpiLabel>
          <div className="text-2xl font-semibold text-fg-default mt-1.5">
            {forecastQ.data?.daysRemaining ?? 0}
          </div>
          <KpiSub>until Dec 24</KpiSub>
        </Card>
      </div>

      {/* SEASON COMPARISON */}
      <Card padding="md" className="mt-4">
        <SectionTitle>Revenue by season</SectionTitle>
        <div className="h-[280px]">
          {(seasonComparisonQ.data ?? []).length === 0 ? (
            <div className="h-full flex items-center justify-center text-fg-muted">
              No season data yet
            </div>
          ) : (
            <ReactChart
              type="bar"
              data={seasonRevenueChart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    labels: { color: '#2D2C29', font: { size: 12, weight: 'bold' } },
                  },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        if (ctx.dataset.label === 'Revenue') {
                          return `Revenue: ${fmt(Number(ctx.parsed.y) * 100)}`;
                        }
                        return `Transactions: ${ctx.parsed.y}`;
                      },
                    },
                  },
                },
                scales: {
                  x: { grid: { color: '#2e2e2a' } },
                  y: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: '#2e2e2a' },
                    ticks: { callback: (v) => fmtCompact(Number(v) * 100) },
                    title: { display: true, text: 'Revenue', color: '#5F5E5A' },
                  },
                  y1: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Transactions', color: '#5F5E5A' },
                  },
                },
              }}
            />
          )}
        </div>
      </Card>

      <Card padding="none" className="mt-4 overflow-hidden">
        {/* Desktop: table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={thHeader}>Season</th>
                <th className={thHeader}>Revenue</th>
                <th className={thHeader}>Transactions</th>
                <th className={thHeader}>AOV</th>
                <th className={thHeader}>Delivery rate</th>
                <th className={thHeader}>New</th>
                <th className={thHeader}>Returning</th>
              </tr>
            </thead>
            <tbody>
              {[...(seasonComparisonQ.data ?? [])].reverse().map((s, i) => (
                <tr
                  key={s.seasonYear}
                  className={i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset'}
                >
                  <td className={tdCell}>{s.seasonYear}</td>
                  <td className={tdCell}>{fmt(s.revenueCents)}</td>
                  <td className={tdCell}>{s.transactions}</td>
                  <td className={tdCell}>{fmt(s.avgOrderCents)}</td>
                  <td className={tdCell}>{(s.deliveryRate * 100).toFixed(0)}%</td>
                  <td className={tdCell}>{s.newCustomers}</td>
                  <td className={tdCell}>{s.returningCustomers}</td>
                </tr>
              ))}
              {(seasonComparisonQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className={cn(tdCell, 'text-center text-fg-muted')}>
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: card stack */}
        <div className="lg:hidden flex flex-col gap-2 p-3">
          {[...(seasonComparisonQ.data ?? [])].reverse().map((s) => (
            <div
              key={s.seasonYear}
              className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border-default bg-bg-inset p-3"
            >
              <div className="text-[14px] font-semibold text-fg-default">
                {s.seasonYear}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <div className="text-fg-muted">Revenue</div>
                <div className="text-fg-default text-right">{fmt(s.revenueCents)}</div>
                <div className="text-fg-muted">Transactions</div>
                <div className="text-fg-default text-right">{s.transactions}</div>
                <div className="text-fg-muted">AOV</div>
                <div className="text-fg-default text-right">{fmt(s.avgOrderCents)}</div>
                <div className="text-fg-muted">Delivery rate</div>
                <div className="text-fg-default text-right">{(s.deliveryRate * 100).toFixed(0)}%</div>
                <div className="text-fg-muted">New / Returning</div>
                <div className="text-fg-default text-right">
                  {s.newCustomers} / {s.returningCustomers}
                </div>
              </div>
            </div>
          ))}
          {(seasonComparisonQ.data ?? []).length === 0 && (
            <div className="p-6 text-center text-fg-muted text-[13px]">
              No data
            </div>
          )}
        </div>
      </Card>

      {/* COHORT RETENTION */}
      <Card padding="md" className="mt-4">
        <SectionTitle>Customer retention by cohort</SectionTitle>
        {cohorts.length === 0 ? (
          <div className="text-fg-muted text-[13px] py-6 text-center">
            Need at least one season of data to build cohorts.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
              <div className="min-w-[480px]">
                <div
                  className="grid gap-1 text-[12px]"
                  style={{
                    gridTemplateColumns: `120px repeat(${allSeasons.length}, minmax(80px, 1fr))`,
                  }}
                >
                  <div className="px-3 py-2 font-medium text-fg-muted text-left">
                    Cohort
                  </div>
                  {allSeasons.map((s) => (
                    <div
                      key={`h-${s}`}
                      className="px-3 py-2 font-medium text-fg-muted text-center"
                    >
                      {s}
                    </div>
                  ))}

                  {cohorts.map((c) => (
                    <RetentionRow key={c.cohortSeason} cohort={c} allSeasons={allSeasons} />
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:hidden mt-2 text-[11px] text-fg-muted">
              ← scroll to see all seasons
            </div>

            <div className="mt-4 text-[13px] text-brand-softfg">
              {oldestCohort ? (
                <>
                  {oldestThisSeasonRetention.toFixed(1)}% of customers from{' '}
                  {oldestCohort.cohortSeason} (
                  <span className="text-fg-default">{oldestCohort.cohortSize} buyers</span>
                  ) returned in{' '}
                  {allSeasons[allSeasons.length - 1]}.
                </>
              ) : null}
            </div>
          </>
        )}
      </Card>

      {/* CUSTOMER LTV */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card padding="md" className="lg:col-span-2">
          <SectionTitle>Customer LTV distribution</SectionTitle>
          <div className="h-[240px]">
            {(ltvQ.data?.buckets ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-fg-muted">
                No customer data
              </div>
            ) : (
              <Bar
                data={ltvChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${ctx.parsed.y} customers`,
                      },
                    },
                  },
                  scales: {
                    x: { grid: { color: '#2e2e2a' } },
                    y: { grid: { color: '#2e2e2a' }, ticks: { precision: 0 } },
                  },
                }}
              />
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
          <Card padding="md">
            <KpiLabel>Top 10% drives</KpiLabel>
            <div className="text-2xl font-semibold text-success-fg mt-1.5">
              {(ltvQ.data?.top10pctRevenue ?? 0).toFixed(1)}%
            </div>
            <KpiSub>of total revenue</KpiSub>
          </Card>
          <Card padding="md">
            <KpiLabel>Bottom 50% drives</KpiLabel>
            <div className="text-2xl font-semibold text-brand-softfg mt-1.5">
              {(ltvQ.data?.bottom50pctRevenue ?? 0).toFixed(1)}%
            </div>
            <KpiSub>of total revenue</KpiSub>
          </Card>
          <Card padding="md">
            <KpiLabel>Median LTV</KpiLabel>
            <div className="text-2xl font-semibold text-fg-default mt-1.5">
              {fmt(ltvQ.data?.medianLtv ?? 0)}
            </div>
            <KpiSub>{ltvQ.data?.totalCustomers ?? 0} customers</KpiSub>
          </Card>
        </div>
      </div>

    </div>
  );
}

function RetentionRow({
  cohort,
  allSeasons,
}: {
  cohort: { cohortSeason: number; cohortSize: number; retention: Record<number, number> };
  allSeasons: number[];
}) {
  return (
    <>
      <div className="px-3 py-2.5 text-fg-default font-medium border-b border-border-default">
        {cohort.cohortSeason}
        <span className="text-fg-muted font-normal ml-1.5">
          ({cohort.cohortSize})
        </span>
      </div>
      {allSeasons.map((s) => {
        const isFuture = s < cohort.cohortSeason;
        const pct = cohort.retention[s];
        const hasValue = pct !== undefined;
        const isCohort = s === cohort.cohortSeason;
        const opacity = !hasValue ? 0 : Math.max(0.12, Math.min(1, pct / 100));

        if (isCohort) {
          return (
            <div
              key={`${cohort.cohortSeason}-${s}`}
              className="px-3 py-2.5 text-center border-b border-border-default font-semibold tabular-nums bg-brand-soft text-brand-softfg"
            >
              {hasValue ? `${pct.toFixed(0)}%` : '—'}
            </div>
          );
        }

        if (isFuture) {
          return (
            <div
              key={`${cohort.cohortSeason}-${s}`}
              className="px-3 py-2.5 text-center border-b border-border-default tabular-nums bg-bg-app text-fg-default"
            >
              —
            </div>
          );
        }

        // Heatmap intensity — data viz, intentional literal rgba.
        return (
          <div
            key={`${cohort.cohortSeason}-${s}`}
            className="px-3 py-2.5 text-center border-b border-border-default tabular-nums"
            style={{
              background: `rgba(124, 181, 66, ${opacity})`,
              color: hasValue && pct >= 50 ? '#0f1a05' : undefined,
            }}
          >
            {hasValue ? `${pct.toFixed(0)}%` : '—'}
          </div>
        );
      })}
    </>
  );
}
