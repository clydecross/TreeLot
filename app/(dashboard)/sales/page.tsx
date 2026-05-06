'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chart, registerables } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

Chart.register(...registerables);
Chart.defaults.color = '#5F5E5A';
Chart.defaults.borderColor = '#2e2e2a';
Chart.defaults.font.family = 'inherit';

type RangeKey = 'today' | 'week' | 'season';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'season', label: 'This Season' },
];

function fmt(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFor(key: RangeKey): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const todayStr = ymdLocal(today);

  if (key === 'today') {
    return { dateFrom: todayStr, dateTo: todayStr };
  }
  if (key === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { dateFrom: ymdLocal(start), dateTo: todayStr };
  }
  // season: Nov 1 of current year, or previous year if today < Nov 1
  const year = today.getMonth() < 10 ? today.getFullYear() - 1 : today.getFullYear();
  return { dateFrom: `${year}-11-01`, dateTo: todayStr };
}

function mmdd(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split('-');
  return `${m}/${d}`;
}

export default function SalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get('range');
  const range: RangeKey =
    rangeParam === 'week' || rangeParam === 'season' || rangeParam === 'today'
      ? rangeParam
      : 'today';

  const { dateFrom, dateTo } = useMemo(() => rangeFor(range), [range]);

  const summaryQ = trpc.analytics.summary.useQuery({ dateFrom, dateTo });

  const hourlyQ = trpc.analytics.hourlySales.useQuery(
    { date: dateFrom },
    { enabled: range === 'today' }
  );

  const dailyQ = trpc.analytics.dailySales.useQuery(
    { dateFrom, dateTo },
    { enabled: range !== 'today' }
  );

  const topCustomersQ = trpc.analytics.topCustomers.useQuery({ dateFrom, dateTo, limit: 10 });

  const byTreeTypeQ = trpc.analytics.byTreeType.useQuery({ dateFrom, dateTo });

  const bySizeQ = trpc.analytics.bySize.useQuery({ dateFrom, dateTo });

  function setRange(k: RangeKey) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('range', k);
    router.push(`/sales?${sp.toString()}`);
  }

  const summary = summaryQ.data;
  const transactions = summary?.transactions ?? 0;
  const empty = !summaryQ.isLoading && transactions === 0;

  const deliveryRate =
    transactions === 0 ? 0 : ((summary!.deliveryCount / transactions) * 100);

  // ── Left chart data ─────────────────────────────────────────────────────
  const hourlyData = useMemo(() => {
    const data = hourlyQ.data ?? [];
    return {
      labels: data.map((h) => `${h.hour}:00`),
      datasets: [
        {
          label: 'Revenue',
          data: data.map((h) => h.revenueCents / 100),
          backgroundColor: '#7CB542',
          borderColor: '#7CB542',
          // attach tx for tooltip
          _tx: data.map((h) => h.transactions),
        },
      ],
    };
  }, [hourlyQ.data]);

  const dailyData = useMemo(() => {
    const data = dailyQ.data ?? [];
    return {
      labels: data.map((d) => mmdd(d.date)),
      datasets: [
        {
          label: 'Revenue',
          data: data.map((d) => d.revenueCents / 100),
          borderColor: '#9FE1CB',
          backgroundColor: 'rgba(159,225,203,0.15)',
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#9FE1CB',
          pointRadius: 3,
          _tx: data.map((d) => d.transactions),
        },
      ],
    };
  }, [dailyQ.data]);

  // ── Right chart: payment methods doughnut ───────────────────────────────
  const paymentChartData = useMemo(() => {
    const cash = summary?.cashCount ?? 0;
    const card = summary?.cardCount ?? 0;
    const venmo = summary?.venmoCount ?? 0;
    const zelle = summary?.zelleCount ?? 0;
    return {
      labels: ['Cash', 'Card', 'Venmo', 'Zelle'],
      datasets: [
        {
          data: [cash, card, venmo, zelle],
          backgroundColor: ['#7CB542', '#9FE1CB', '#4a7a2a', '#1a4a7a'],
          borderColor: '#252521',
          borderWidth: 2,
        },
      ],
    };
  }, [summary]);

  const paymentTotal =
    (summary?.cashCount ?? 0) +
    (summary?.cardCount ?? 0) +
    (summary?.venmoCount ?? 0) +
    (summary?.zelleCount ?? 0);

  // ── Tree type / size horizontal bar charts ──────────────────────────────
  const treeTypeChart = useMemo(() => {
    const data = byTreeTypeQ.data ?? [];
    return {
      labels: data.map((d) => d.treeType),
      datasets: [
        {
          label: 'Revenue',
          data: data.map((d) => d.revenueCents / 100),
          backgroundColor: '#7CB542',
          _count: data.map((d) => d.count),
        },
      ],
    };
  }, [byTreeTypeQ.data]);

  const sizeChart = useMemo(() => {
    const data = bySizeQ.data ?? [];
    return {
      labels: data.map((d) => d.treeSizeRange),
      datasets: [
        {
          label: 'Revenue',
          data: data.map((d) => d.revenueCents / 100),
          backgroundColor: '#7CB542',
          _count: data.map((d) => d.count),
        },
      ],
    };
  }, [bySizeQ.data]);

  return (
    <div className="h-full overflow-y-auto bg-bg-app p-6">
      <h1 className="text-[22px] font-semibold text-fg-default m-0">
        Sales Command Center
      </h1>

      {/* Filter bar */}
      <div className="flex gap-2 mt-4">
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <Button
              key={r.key}
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          );
        })}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Revenue</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">{fmt(summary?.revenueCents ?? 0)}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Transactions</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">{transactions}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Avg Order</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">{fmt(summary?.avgOrderCents ?? 0)}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Delivery Rate</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">{deliveryRate.toFixed(0)}%</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Stand Attach</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">
            {((summary?.standAttachRate ?? 0) * 100).toFixed(0)}%
          </div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wide text-fg-muted">Lights Attach</div>
          <div className="text-2xl font-semibold text-fg-default mt-1">
            {((summary?.lightsAttachRate ?? 0) * 100).toFixed(0)}%
          </div>
        </Card>
      </div>

      {empty ? (
        <Card padding="lg" className="mt-4 text-center text-fg-muted">
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="text-[14px]">No sales for this range.</div>
            {range !== 'season' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRange(range === 'today' ? 'week' : 'season')}
              >
                {range === 'today' ? 'Try this week' : 'Try this season'} →
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card padding="md">
              <div className="text-[13px] font-medium text-fg-default mb-3">
                {range === 'today' ? 'Hourly revenue' : 'Daily revenue'}
              </div>
              <div style={{ height: 240 }}>
                {range === 'today' ? (
                  <Bar
                    data={hourlyData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const ds = ctx.dataset as unknown as { _tx?: number[] };
                              const tx = ds._tx?.[ctx.dataIndex] ?? 0;
                              return `${fmt(Number(ctx.parsed.y) * 100)} (${tx} tx)`;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: '#2e2e2a' } },
                        y: {
                          grid: { color: '#2e2e2a' },
                          ticks: {
                            callback: (v) => '$' + Number(v).toFixed(0),
                          },
                        },
                      },
                    }}
                  />
                ) : (
                  <Line
                    data={dailyData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const ds = ctx.dataset as unknown as { _tx?: number[] };
                              const tx = ds._tx?.[ctx.dataIndex] ?? 0;
                              return `${fmt(Number(ctx.parsed.y) * 100)} (${tx} tx)`;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: '#2e2e2a' } },
                        y: {
                          grid: { color: '#2e2e2a' },
                          ticks: {
                            callback: (v) => '$' + Number(v).toFixed(0),
                          },
                        },
                      },
                    }}
                  />
                )}
              </div>
            </Card>

            <Card padding="md">
              <div className="text-[13px] font-medium text-fg-default mb-3">
                Payment methods
              </div>
              <div style={{ height: 240 }}>
                <Doughnut
                  data={paymentChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'right',
                        labels: { color: '#5F5E5A', font: { size: 12 } },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = Number(ctx.parsed) || 0;
                            const pct =
                              paymentTotal === 0
                                ? 0
                                : ((v / paymentTotal) * 100).toFixed(0);
                            return `${ctx.label}: ${v} (${pct}%)`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            </Card>
          </div>

          {/* Top customers table */}
          <Card padding="none" className="mt-4">
            <div className="text-[13px] font-medium text-fg-default p-4 pb-3">
              Top customers
            </div>

            {/* Desktop: table */}
            <table className="hidden lg:table w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-fg-muted">
                  <th className="px-3 py-2 border-b border-border-default font-medium">
                    Rank
                  </th>
                  <th className="px-3 py-2 border-b border-border-default font-medium">
                    Customer
                  </th>
                  <th className="px-3 py-2 border-b border-border-default font-medium">
                    Purchases
                  </th>
                  <th className="px-3 py-2 border-b border-border-default font-medium">
                    Total Spent
                  </th>
                </tr>
              </thead>
              <tbody>
                {(topCustomersQ.data ?? []).map((c, i) => (
                  <tr
                    key={c.customerId}
                    className={cn(
                      'text-fg-default',
                      i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset',
                    )}
                  >
                    <td className="px-3 py-2.5 border-b border-border-default">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border-default">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border-default">
                      {c.purchaseCount}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border-default">
                      {fmt(c.totalCents)}
                    </td>
                  </tr>
                ))}
                {(topCustomersQ.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-fg-muted">
                      No customer data for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Mobile: card stack */}
            <div className="lg:hidden flex flex-col gap-2 px-3 pb-3">
              {(topCustomersQ.data ?? []).map((c, i) => (
                <div
                  key={c.customerId}
                  className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-border-default bg-bg-inset p-3"
                >
                  <Badge variant="neutral" size="sm">Rank #{i + 1}</Badge>
                  <div className="text-[14px] font-semibold text-fg-default">
                    {c.firstName} {c.lastName}
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    {c.purchaseCount} {c.purchaseCount === 1 ? 'purchase' : 'purchases'} · {fmt(c.totalCents)}
                  </div>
                </div>
              ))}
              {(topCustomersQ.data ?? []).length === 0 && (
                <div className="p-6 text-center text-fg-muted text-[13px]">
                  No customer data for this range.
                </div>
              )}
            </div>
          </Card>

          {/* Tree type + size */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card padding="md">
              <div className="text-[13px] font-medium text-fg-default mb-3">
                Revenue by tree type
              </div>
              <div style={{ height: 240 }}>
                <Bar
                  data={treeTypeChart}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const ds = ctx.dataset as unknown as { _count?: number[] };
                            const c = ds._count?.[ctx.dataIndex] ?? 0;
                            return `${fmt(Number(ctx.parsed.x) * 100)} (${c} sold)`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { color: '#2e2e2a' },
                        ticks: { callback: (v) => '$' + Number(v).toFixed(0) },
                      },
                      y: { grid: { color: '#2e2e2a' } },
                    },
                  }}
                />
              </div>
            </Card>

            <Card padding="md">
              <div className="text-[13px] font-medium text-fg-default mb-3">
                Revenue by size
              </div>
              <div style={{ height: 240 }}>
                <Bar
                  data={sizeChart}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const ds = ctx.dataset as unknown as { _count?: number[] };
                            const c = ds._count?.[ctx.dataIndex] ?? 0;
                            return `${fmt(Number(ctx.parsed.x) * 100)} (${c} sold)`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { color: '#2e2e2a' },
                        ticks: { callback: (v) => '$' + Number(v).toFixed(0) },
                      },
                      y: { grid: { color: '#2e2e2a' } },
                    },
                  }}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
