import { prisma } from '@/lib/db';

// Same season formula used in the per-org analytics page.
// Before Nov 1: active season is the one that started last November.
const _now   = new Date();
const CURR   = _now.getMonth() < 10 ? _now.getFullYear() - 1 : _now.getFullYear();
const PRIOR  = CURR - 1;
const AS_OF  = _now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getSalesData() {
  const [orgsRaw, allTime, bySeason] = await Promise.all([

    // Per-org: current + prior season purchases, customer count
    prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id:        true,
        name:      true,
        plan:      true,
        createdAt: true,
        _count: { select: { customers: true } },
        locations: {
          select: {
            purchases: {
              where:  { seasonYear: { in: [CURR, PRIOR] } },
              select: { totalCents: true, seasonYear: true },
            },
          },
        },
      },
    }),

    // Platform all-time aggregate
    prisma.purchase.aggregate({
      _sum:   { totalCents: true },
      _count: { _all: true },
    }),

    // Platform revenue + transactions by season year
    prisma.purchase.groupBy({
      by:      ['seasonYear'],
      _sum:    { totalCents: true },
      _count:  { _all: true },
      orderBy: { seasonYear: 'asc' },
    }),
  ]);

  // Flatten per-org numbers
  const orgs = orgsRaw
    .map(org => {
      const all   = org.locations.flatMap(l => l.purchases);
      const curr  = all.filter(p => p.seasonYear === CURR);
      const prior = all.filter(p => p.seasonYear === PRIOR);

      const currRev  = curr.reduce((s, p) => s + p.totalCents, 0);
      const priorRev = prior.reduce((s, p) => s + p.totalCents, 0);
      const currTx   = curr.length;
      const aov      = currTx > 0 ? currRev / currTx : 0;

      // null  → no data in either season
      // +Inf  → new this season (no prior baseline)
      // number → normal YoY
      const yoy: number | null =
        priorRev > 0 ? (currRev - priorRev) / priorRev
        : currRev > 0 ? Infinity
        : null;

      return {
        id: org.id, name: org.name, plan: org.plan, createdAt: org.createdAt,
        customers: org._count.customers,
        currRev, priorRev, currTx, aov, yoy,
      };
    })
    .sort((a, b) => b.currRev - a.currRev);

  const platformCurrRev  = orgs.reduce((s, o) => s + o.currRev, 0);
  const platformPriorRev = orgs.reduce((s, o) => s + o.priorRev, 0);
  const platformCurrTx   = orgs.reduce((s, o) => s + o.currTx, 0);
  const platformAllRev   = allTime._sum.totalCents ?? 0;
  const platformAllTx    = allTime._count._all;
  const platformCustomers = orgs.reduce((s, o) => s + o.customers, 0);
  const platformYoy: number | null =
    platformPriorRev > 0 ? (platformCurrRev - platformPriorRev) / platformPriorRev : null;

  const seasonRows = bySeason.map(s => ({
    seasonYear:   s.seasonYear,
    revenueCents: s._sum.totalCents ?? 0,
    transactions: s._count._all,
  }));

  // Derived highlights
  const topRevOrg   = orgs[0] ?? null;
  const rankedByYoy = orgs.filter(o => o.yoy !== null && isFinite(o.yoy!));
  const bestYoyOrg  = [...rankedByYoy].sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0))[0] ?? null;
  const worstYoyOrg = [...rankedByYoy].sort((a, b) => (a.yoy ?? 0) - (b.yoy ?? 0))[0] ?? null;

  return {
    orgs, seasonRows, platformCurrRev, platformPriorRev, platformCurrTx,
    platformAllRev, platformAllTx, platformCustomers, platformYoy,
    topRevOrg, bestYoyOrg, worstYoyOrg,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(cents: number, decimals = 0) {
  return '$' + (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(cents: number) {
  const d = cents / 100;
  if (d >= 1_000_000) return '$' + (d / 1_000_000).toFixed(1) + 'M';
  if (d >= 1_000)     return '$' + (d / 1_000).toFixed(1) + 'k';
  return '$' + d.toFixed(0);
}

function pctStr(yoy: number | null): string {
  if (yoy === null)        return '—';
  if (!isFinite(yoy))      return 'New';
  const sign = yoy >= 0 ? '+' : '';
  return sign + (yoy * 100).toFixed(1) + '%';
}

function yoyColor(yoy: number | null): string {
  if (yoy === null)   return '#4a4940';
  if (!isFinite(yoy)) return '#6db86d';
  return yoy >= 0 ? '#6db86d' : '#e05c5c';
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#2e2e2a] bg-[#141412] px-5 py-4">
      <div className="text-[10px] uppercase tracking-widest text-[#6b6960] font-mono">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold text-[#e8e6e0] tabular-nums leading-none">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-[#6b6960]">{sub}</div>}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const cls: Record<string, string> = {
    starter:    'bg-[#2a2a26] text-[#a89f8c]',
    pro:        'bg-[#1a2e1a] text-[#6db86d]',
    enterprise: 'bg-[#1a1a2e] text-[#6d8db8]',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono ${cls[plan] ?? cls.starter}`}>
      {plan}
    </span>
  );
}

function YoY({ value }: { value: number | null }) {
  return (
    <span className="font-mono tabular-nums" style={{ color: yoyColor(value) }}>
      {pctStr(value)}
    </span>
  );
}

function SectionHeader({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-0 px-5 py-3 border-b border-[#2e2e2a] bg-[#1a1a17]">
      <span className="text-[10px] uppercase tracking-widest text-[#6b6960] font-mono">{children}</span>
      {aside && <span className="text-[11px] text-[#4a4940]">{aside}</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminSalesPage() {
  const d = await getSalesData();
  const maxRev = Math.max(...d.seasonRows.map(s => s.revenueCents), 1);

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[18px] font-semibold text-[#e8e6e0]">Platform Sales Dashboard</h1>
          <p className="text-[12px] text-[#6b6960] mt-0.5">
            {d.orgs.length} lot{d.orgs.length !== 1 ? 's' : ''} · {CURR} season · as of {AS_OF}
          </p>
        </div>
        {d.platformYoy !== null && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-[#6b6960] font-mono">Platform YoY</div>
            <div className="text-[22px] font-semibold tabular-nums mt-0.5" style={{ color: yoyColor(d.platformYoy) }}>
              {pctStr(d.platformYoy)}
            </div>
            <div className="text-[10px] text-[#4a4940]">vs {PRIOR} season</div>
          </div>
        )}
      </div>

      {/* ── KPI hero ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <KpiCard
          label="All-time Revenue"
          value={fmtCompact(d.platformAllRev)}
          sub={`${d.platformAllTx.toLocaleString()} total transactions`}
        />
        <KpiCard
          label={`${CURR} Season Revenue`}
          value={fmtCompact(d.platformCurrRev)}
          sub={`${d.platformCurrTx} transactions`}
        />
        <KpiCard
          label={`${CURR} Platform AOV`}
          value={d.platformCurrTx > 0 ? fmt(d.platformCurrRev / d.platformCurrTx, 2) : '—'}
          sub="avg order value"
        />
        <KpiCard
          label="Total Customers"
          value={d.platformCustomers.toLocaleString()}
          sub="across all lots"
        />
      </div>

      {/* ── Revenue by season bar chart ── */}
      <div className="rounded-lg border border-[#2e2e2a] overflow-hidden mb-6">
        <SectionHeader aside={`${d.seasonRows.length} seasons`}>
          Platform Revenue by Season
        </SectionHeader>
        <div className="px-6 pt-6 pb-4 bg-[#141412]">
          {d.seasonRows.length === 0 ? (
            <p className="text-[13px] text-[#6b6960] py-4">No season data yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-4 h-[160px] border-b border-[#2e2e2a]">
                {d.seasonRows.map(s => {
                  const pct     = s.revenueCents / maxRev;
                  const barH    = Math.max(6, Math.round(pct * 144));
                  const isCurr  = s.seasonYear === CURR;
                  return (
                    <div key={s.seasonYear} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-[10px] font-mono text-[#6b6960] tabular-nums">
                        {fmtCompact(s.revenueCents)}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height:          barH,
                          backgroundColor: isCurr ? '#7CB542' : '#2e3d1e',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2">
                {d.seasonRows.map(s => (
                  <div key={s.seasonYear} className="flex-1 text-center">
                    <span className={`text-[11px] font-mono ${s.seasonYear === CURR ? 'text-[#a89f8c]' : 'text-[#4a4940]'}`}>
                      {s.seasonYear}
                    </span>
                    <div className="text-[10px] text-[#4a4940]">{s.transactions} txns</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Lot performance table ── */}
      <div className="rounded-lg border border-[#2e2e2a] overflow-hidden mb-6">
        <SectionHeader aside={`vs ${PRIOR}`}>
          Lot Performance — {CURR} Season
        </SectionHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2e2e2a] bg-[#111110]">
                {[
                  ['Lot',            'text-left'],
                  ['Plan',           'text-left'],
                  [`${CURR} Rev`,    'text-right'],
                  ['Txns',           'text-right'],
                  ['AOV',            'text-right'],
                  [`${PRIOR} Rev`,   'text-right'],
                  ['YoY',            'text-right'],
                  ['Customers',      'text-right'],
                  ['',               'text-right'],
                ].map(([label, align]) => (
                  <th key={label} className={`px-4 py-2.5 text-[10px] uppercase tracking-wide text-[#6b6960] font-normal ${align}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.orgs.map((org, i) => (
                <tr
                  key={org.id}
                  className={`border-b border-[#2e2e2a] last:border-0 ${i % 2 === 0 ? 'bg-[#141412]' : 'bg-[#111110]'}`}
                >
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="text-[13px] font-medium text-[#e8e6e0]">{org.name}</div>
                    <div className="text-[10px] font-mono text-[#4a4940] mt-0.5">
                      Since {org.createdAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={org.plan} /></td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums font-mono text-[#e8e6e0]">
                    {org.currRev > 0 ? fmt(org.currRev) : <span className="text-[#4a4940]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums text-[#a89f8c]">
                    {org.currTx > 0 ? org.currTx : <span className="text-[#4a4940]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums text-[#a89f8c]">
                    {org.aov > 0 ? fmt(org.aov, 0) : <span className="text-[#4a4940]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums font-mono text-[#6b6960]">
                    {org.priorRev > 0 ? fmt(org.priorRev) : <span className="text-[#4a4940]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px]">
                    <YoY value={org.yoy} />
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums text-[#a89f8c]">
                    {org.customers.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/view/${org.id}`}
                      className="text-[11px] font-mono text-[#6b6960] hover:text-[#a89f8c] transition-colors whitespace-nowrap"
                    >
                      View →
                    </a>
                  </td>
                </tr>
              ))}
              {d.orgs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-[#4a4940]">
                    No organizations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Platform totals footer */}
        {d.orgs.length > 1 && (
          <div className="border-t border-[#2e2e2a] bg-[#1a1a17] px-5 py-3 flex flex-wrap items-center gap-6 text-[12px] font-mono">
            <span className="text-[10px] uppercase tracking-widest text-[#6b6960]">Platform total</span>
            <span className="text-[#e8e6e0] tabular-nums">{fmt(d.platformCurrRev)}</span>
            <span className="text-[#a89f8c] tabular-nums">{d.platformCurrTx} txns</span>
            <span className="text-[#a89f8c] tabular-nums">
              AOV {d.platformCurrTx > 0 ? fmt(d.platformCurrRev / d.platformCurrTx, 0) : '—'}
            </span>
            {d.platformYoy !== null && (
              <span><YoY value={d.platformYoy} /></span>
            )}
          </div>
        )}
      </div>

      {/* ── Highlights ── */}
      {d.orgs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top revenue */}
          {d.topRevOrg && (
            <div className="rounded-lg border border-[#2e2e2a] bg-[#141412] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest font-mono text-[#6db86d] mb-2">
                Top Revenue · {CURR}
              </div>
              <div className="text-[15px] font-semibold text-[#e8e6e0]">{d.topRevOrg.name}</div>
              <div className="text-[26px] font-mono tabular-nums text-[#6db86d] mt-1 leading-none">
                {fmt(d.topRevOrg.currRev)}
              </div>
              <div className="flex flex-wrap gap-3 mt-2.5 text-[11px] text-[#6b6960]">
                <span>{d.topRevOrg.currTx} transactions</span>
                <span>AOV {fmt(d.topRevOrg.aov, 0)}</span>
                <span>{d.topRevOrg.customers} customers</span>
              </div>
            </div>
          )}

          {/* Best YoY growth */}
          {d.bestYoyOrg && d.bestYoyOrg.id !== d.topRevOrg?.id && (
            <div className="rounded-lg border border-[#2e2e2a] bg-[#141412] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest font-mono text-[#6d8db8] mb-2">
                Fastest Growing · {CURR}
              </div>
              <div className="text-[15px] font-semibold text-[#e8e6e0]">{d.bestYoyOrg.name}</div>
              <div className="text-[26px] font-mono tabular-nums text-[#6d8db8] mt-1 leading-none">
                {pctStr(d.bestYoyOrg.yoy)} YoY
              </div>
              <div className="flex flex-wrap gap-3 mt-2.5 text-[11px] text-[#6b6960]">
                <span>{fmt(d.bestYoyOrg.currRev)} this season</span>
                <span>{fmt(d.bestYoyOrg.priorRev)} prior</span>
              </div>
            </div>
          )}

          {/* Needs attention */}
          {d.worstYoyOrg && (d.worstYoyOrg.yoy ?? 0) < 0 && (
            <div className="rounded-lg border border-[#2e2e2a] bg-[#141412] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest font-mono text-[#e05c5c] mb-2">
                Needs Attention · {CURR}
              </div>
              <div className="text-[15px] font-semibold text-[#e8e6e0]">{d.worstYoyOrg.name}</div>
              <div className="text-[26px] font-mono tabular-nums text-[#e05c5c] mt-1 leading-none">
                {pctStr(d.worstYoyOrg.yoy)} YoY
              </div>
              <div className="flex flex-wrap gap-3 mt-2.5 text-[11px] text-[#6b6960]">
                <span>{fmt(d.worstYoyOrg.currRev)} this season</span>
                <span>{fmt(d.worstYoyOrg.priorRev)} prior</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
