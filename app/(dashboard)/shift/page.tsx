'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const PAYMENT_COLOR: Record<'cash' | 'card' | 'venmo' | 'zelle', string> = {
  cash:  '#7CB542',
  card:  '#9FE1CB',
  venmo: '#4a7a2a',
  zelle: '#1a4a7a',
};

const PAYMENT_LABEL: Record<'cash' | 'card' | 'venmo' | 'zelle', string> = {
  cash:  'Cash',
  card:  'Card',
  venmo: 'Venmo',
  zelle: 'Zelle',
};

function fmt(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return (negative ? '-$' : '$') + (abs / 100).toFixed(2);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const LABEL_CLASS = 'text-[11px] uppercase tracking-[0.05em] text-fg-muted';

/**
 * Parse a user-typed dollar string into cents (integer).
 * Accepts: "100", "100.5", "100.55", "$100.55", "1,234.50".
 * Returns null if the input is empty or unparseable (so we can distinguish
 * "not yet entered" from "entered zero").
 */
function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

export default function ShiftPage() {
  const [date, setDate] = useState(() => ymdLocal(new Date()));
  const [countedRaw, setCountedRaw] = useState('');
  const [notes, setNotes] = useState('');

  const summaryQ = trpc.shift.summary.useQuery({ date });

  const summary = summaryQ.data;
  const totals = summary?.totals;

  const countedCents = useMemo(() => parseDollarsToCents(countedRaw), [countedRaw]);
  const expectedCents = totals?.cashCents ?? 0;
  const varianceCents =
    countedCents === null ? null : countedCents - expectedCents;

  let varianceClass = 'text-brand-softfg';
  if (varianceCents !== null) {
    const abs = Math.abs(varianceCents);
    if (abs === 0)            varianceClass = 'text-brand-softfg';
    else if (abs <= 500)      varianceClass = 'text-warn-fg';
    else                       varianceClass = 'text-error-fg';
  }

  // Reverse-sort transactions for display (most recent first)
  const txDisplay = useMemo(() => {
    if (!summary) return [];
    return [...summary.transactions].reverse();
  }, [summary]);

  const paymentTotalCents = totals
    ? totals.cashCents + totals.cardCents + totals.venmoCents + totals.zelleCents
    : 0;

  const paymentRows: {
    key: 'cash' | 'card' | 'venmo' | 'zelle';
    cents: number;
    count: number;
  }[] = totals
    ? [
        { key: 'cash',  cents: totals.cashCents,  count: totals.cashCount },
        { key: 'card',  cents: totals.cardCents,  count: totals.cardCount },
        { key: 'venmo', cents: totals.venmoCents, count: totals.venmoCount },
        { key: 'zelle', cents: totals.zelleCents, count: totals.zelleCount },
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto shift-root bg-bg-app p-6">
      {/* Print-only header */}
      <div className="print-only print-header">
        <h1 className="text-[22px] font-bold m-0">
          End-of-shift Z report
        </h1>
        <div className="text-[13px] mt-1">
          {summary?.location.name ?? ''} — {date}
        </div>
      </div>

      {/* Header row (screen) */}
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-fg-default m-0">
            End of shift
          </h1>
          <div className="text-[12px] text-fg-muted mt-1">
            {summary?.location.name ?? (summaryQ.isLoading ? 'Loading…' : '—')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-fg-muted" htmlFor="shift-date">
            Date
          </label>
          <Input
            id="shift-date"
            type="date"
            inputSize="sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-4 shift-grid">
        {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 shift-left">
          {/* Revenue summary */}
          <Card padding="lg" className="report-card">
            <div className={LABEL_CLASS}>Revenue</div>
            <div className="revenue-total text-3xl font-semibold text-brand-softfg mt-1">
              {fmt(totals?.revenueCents ?? 0)}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <div className={LABEL_CLASS}>Subtotal</div>
                <div className="text-fg-default text-[16px] mt-0.5">
                  {fmt(totals?.subtotalCents ?? 0)}
                </div>
              </div>
              <div>
                <div className={LABEL_CLASS}>Tax</div>
                <div className="text-fg-default text-[16px] mt-0.5">
                  {fmt(totals?.taxCents ?? 0)}
                </div>
              </div>
              <div>
                <div className={LABEL_CLASS}>Transactions</div>
                <div className="text-fg-default text-[16px] mt-0.5">
                  {totals?.transactions ?? 0}
                </div>
              </div>
            </div>
          </Card>

          {/* Payment method breakdown */}
          <Card padding="md" className="report-card">
            <div className="text-[13px] text-fg-default font-medium mb-3">
              Payment methods
            </div>
            {paymentRows.map((r) => {
              const pct =
                paymentTotalCents === 0 ? 0 : (r.cents / paymentTotalCents) * 100;
              return (
                <div key={r.key} className="mb-2.5">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-fg-default">{PAYMENT_LABEL[r.key]}</span>
                    <span className="text-fg-default">
                      {fmt(r.cents)}{' '}
                      <span className="text-fg-muted text-[12px]">
                        ({r.count} {r.count === 1 ? 'tx' : 'txs'})
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-[3px] bg-bg-inset mt-1 overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-200 ease-out"
                      style={{
                        width: `${pct}%`,
                        background: PAYMENT_COLOR[r.key],
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {paymentTotalCents === 0 && (
              <div className="text-fg-muted text-[12px] mt-1">
                No payments yet today.
              </div>
            )}
          </Card>

          {/* Staff breakdown */}
          <Card padding="none" className="report-card">
            <div className="text-[13px] text-fg-default font-medium px-4 pt-4 pb-3">
              Staff breakdown
            </div>
            {summary && summary.staffBreakdown.length > 0 ? (
              <>
                {/* Desktop: table */}
                <table className="hidden lg:table w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-fg-muted text-left">
                      <th className="px-3 py-1.5 border-b border-border-default font-medium">
                        Rank
                      </th>
                      <th className="px-3 py-1.5 border-b border-border-default font-medium">
                        Name
                      </th>
                      <th className="px-3 py-1.5 border-b border-border-default font-medium">
                        Transactions
                      </th>
                      <th className="px-3 py-1.5 border-b border-border-default font-medium text-right">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.staffBreakdown.map((s, i) => (
                      <tr key={s.id} className={cn('text-fg-default', i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset')}>
                        <td className="px-3 py-2 border-b border-border-default">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 border-b border-border-default">
                          {s.name}
                        </td>
                        <td className="px-3 py-2 border-b border-border-default">
                          {s.transactions}
                        </td>
                        <td className="px-3 py-2 border-b border-border-default text-right">
                          {fmt(s.revenueCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile: card stack */}
                <div className="lg:hidden flex flex-col gap-2 px-3 pb-3">
                  {summary.staffBreakdown.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border-default bg-bg-inset p-3"
                    >
                      <div className="flex flex-col">
                        <div className="text-[13px] font-semibold text-fg-default">
                          #{i + 1} {s.name}
                        </div>
                        <div className="text-[12px] text-fg-muted">
                          {s.transactions} {s.transactions === 1 ? 'tx' : 'txs'}
                        </div>
                      </div>
                      <div className="text-[14px] font-semibold text-fg-default tabular-nums">
                        {fmt(s.revenueCents)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-fg-muted text-[13px] px-4 pb-4">
                No transactions yet today.
              </div>
            )}
          </Card>

          {/* Transaction log */}
          <Card padding="none" className="report-card">
            <div className="text-[13px] text-fg-default font-medium px-4 pt-4 pb-3">
              Transactions
            </div>
            <div className="tx-scroll max-h-[360px] overflow-y-auto">
              {/* Desktop: table */}
              <table className="hidden lg:table w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-fg-muted text-left">
                    <th className="px-3 py-1.5 border-b border-border-default font-medium">
                      Time
                    </th>
                    <th className="px-3 py-1.5 border-b border-border-default font-medium">
                      Customer
                    </th>
                    <th className="px-3 py-1.5 border-b border-border-default font-medium">
                      Tree
                    </th>
                    <th className="px-3 py-1.5 border-b border-border-default font-medium">
                      Payment
                    </th>
                    <th className="px-3 py-1.5 border-b border-border-default font-medium text-right">
                      Total
                    </th>
                    <th className="px-3 py-1.5 border-b border-border-default font-medium">
                      Staff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txDisplay.map((t, i) => (
                    <tr key={t.id} className={cn('text-fg-default', i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset')}>
                      <td className="px-3 py-2 border-b border-border-default">
                        {hhmm(t.time)}
                      </td>
                      <td className="px-3 py-2 border-b border-border-default">
                        {t.customerName}
                      </td>
                      <td className="px-3 py-2 border-b border-border-default">
                        {t.treeType} {t.treeSizeRange}
                      </td>
                      <td className="px-3 py-2 border-b border-border-default">
                        {PAYMENT_LABEL[t.paymentMethod as 'cash' | 'card' | 'venmo' | 'zelle']}
                      </td>
                      <td className="px-3 py-2 border-b border-border-default text-right">
                        {fmt(t.totalCents)}
                      </td>
                      <td className="px-3 py-2 border-b border-border-default">
                        {t.staffName}
                      </td>
                    </tr>
                  ))}
                  {txDisplay.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-fg-muted">
                        No transactions yet today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Mobile: card stack */}
              <div className="lg:hidden flex flex-col gap-2 px-3 pb-3">
                {txDisplay.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-border-default bg-bg-inset p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[13px] font-semibold text-fg-default">
                        {t.customerName}
                      </div>
                      <div className="text-[14px] font-semibold text-fg-default tabular-nums">
                        {fmt(t.totalCents)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[12px] text-fg-muted">
                      <span>
                        {hhmm(t.time)} · {t.treeType} {t.treeSizeRange}
                      </span>
                      <span>
                        {PAYMENT_LABEL[t.paymentMethod as 'cash' | 'card' | 'venmo' | 'zelle']}
                      </span>
                    </div>
                    <div className="text-[12px] text-fg-muted">
                      Staff: {t.staffName}
                    </div>
                  </div>
                ))}
                {txDisplay.length === 0 && (
                  <div className="p-4 text-center text-fg-muted text-[13px]">
                    No transactions yet today.
                  </div>
                )}
              </div>
            </div>
            <div className="text-[12px] text-fg-muted mt-2 px-4 pb-3 pt-2 border-t border-border-default">
              {totals?.transactions ?? 0} transactions ·{' '}
              {fmt(totals?.revenueCents ?? 0)} total
            </div>
          </Card>

          {/* Print-only: cash drawer reconciliation summary */}
          <Card padding="md" className="print-only report-card">
            <div className="text-[13px] font-medium mb-2">
              Cash drawer reconciliation
            </div>
            <div className="text-[13px] leading-relaxed">
              <div>Expected cash: {fmt(expectedCents)}</div>
              <div>
                Counted cash:{' '}
                {countedCents === null ? '—' : fmt(countedCents)}
              </div>
              <div>
                Variance:{' '}
                {varianceCents === null ? '—' : fmt(varianceCents)}
              </div>
              {notes.trim().length > 0 && (
                <div className="mt-2">
                  <strong>Notes:</strong>
                  <div className="whitespace-pre-wrap mt-1">
                    {notes}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: cash drawer panel ─────────────────────────────── */}
        <aside className="no-print flex flex-col gap-4 shift-right">
          <Card variant="elevated" padding="md">
            <div className="text-[13px] text-fg-default font-medium mb-3">
              Cash drawer
            </div>

            <div className="mb-3">
              <div className={LABEL_CLASS}>Expected cash</div>
              <div className="text-fg-default text-[22px] mt-0.5 font-semibold">
                {fmt(expectedCents)}
              </div>
            </div>

            <div className="mb-3">
              <label
                htmlFor="counted-cash"
                className={cn(LABEL_CLASS, 'block mb-1')}
              >
                Counted cash
              </label>
              <Input
                id="counted-cash"
                inputSize="lg"
                inputMode="decimal"
                placeholder="0.00"
                value={countedRaw}
                onChange={(e) => setCountedRaw(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="mb-3">
              <div className={LABEL_CLASS}>Variance</div>
              <div className={cn('text-[20px] mt-0.5 font-semibold', varianceClass)}>
                {varianceCents === null ? '—' : fmt(varianceCents)}
              </div>
            </div>

            <div className="mb-3">
              <label
                htmlFor="shift-notes"
                className={cn(LABEL_CLASS, 'block mb-1')}
              >
                Notes / explanation
              </label>
              <textarea
                id="shift-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-[var(--radius-md)] px-3 py-2 text-[13px] outline-none resize-y bg-bg-inset border border-border-default text-fg-default placeholder:text-fg-subtle focus-ring focus:border-border-brand transition-[border-color,box-shadow] duration-[140ms] ease-out"
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => window.print()}
            >
              Print Z report
            </Button>
          </Card>
        </aside>
      </div>

      {/* Print stylesheet — hides UI chrome and the cash-drawer input */}
      <style>{`
        .print-only { display: none; }

        @media print {
          /* Hide app chrome */
          header, nav, aside.shift-right, .no-print {
            display: none !important;
          }

          /* Reset background/colors for ink-saving */
          html, body, .shift-root {
            background: #ffffff !important;
            color: #000000 !important;
            overflow: visible !important;
            height: auto !important;
          }
          .shift-root {
            padding: 16px !important;
          }

          /* Cards: flat, no dark backgrounds */
          .report-card {
            background: #ffffff !important;
            border: 1px solid #cccccc !important;
            color: #000000 !important;
            page-break-inside: avoid;
            margin-bottom: 12px;
          }
          .report-card * {
            color: #000000 !important;
          }
          .revenue-total {
            color: #000000 !important;
          }

          /* Tables */
          table { color: #000000 !important; }
          table th, table td {
            border-bottom: 1px solid #cccccc !important;
          }

          /* Show the print-only header + reconciliation summary */
          .print-only { display: block !important; }
          .print-header {
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #000000;
          }

          /* Force single-column layout in print */
          .shift-grid {
            display: block !important;
          }
          .shift-left {
            display: block !important;
          }

          /* Allow transaction log to flow across pages */
          .tx-scroll {
            max-height: none !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
