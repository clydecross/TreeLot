'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

const SEASON_YEAR = 2026;

const SIZES = ['3–5ft', '6–8ft', '9–10ft', '11–12ft', '13–14ft', '14ft+'];

const COMBOS = [
  { label: '7ft Fraser + Stand + Lights', type: 'fraser' as const, sizeIdx: 1, stand: true,  lights: true  },
  { label: '7ft Fraser + Stand',          type: 'fraser' as const, sizeIdx: 1, stand: true,  lights: false },
  { label: '9ft Noble + Stand',           type: 'noble'  as const, sizeIdx: 2, stand: true,  lights: false },
  { label: '7ft Fraser only',             type: 'fraser' as const, sizeIdx: 1, stand: false, lights: false },
] as const;

const OTHER_SUBS = [
  { key: 'douglas',     label: 'Douglas Fir' },
  { key: 'balsam',      label: 'Balsam Fir' },
  { key: 'blue_spruce', label: 'Blue Spruce' },
  { key: 'scotch',      label: 'Scotch Pine' },
  { key: 'custom',      label: 'Other…' },
] as const;

const PRICE_PRESETS = [75, 100, 125, 150, 175, 200, 225, 250, 300];
const CASH_PRESETS  = [20, 50, 100, 150, 200, 300];
const NUMPAD_KEYS   = ['7','8','9','4','5','6','1','2','3','C','0','←'] as const;

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function numpadPress(raw: string, digit: string): string {
  if (digit === 'C') return '';
  if (digit === '←') return raw.slice(0, -1);
  if (raw.length >= 5) return raw;
  if (raw === '' && digit === '0') return raw;
  return raw + digit;
}

type TreeType  = 'fraser' | 'noble' | 'other';
type PayMethod = 'cash' | 'card' | 'venmo' | 'zelle';
type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'anytime';

interface SaleResult {
  purchaseId:   string;
  deliveryId:   string | null;
  deliveryDate: string | null;
  customerName: string;
  treeLabel:    string;
  sizeLabel:    string;
  totalCents:   number;
  payMethod:    PayMethod;
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-2 flex items-baseline gap-1.5">
      <span>{children}</span>
      {accent && <span className="text-fg-default font-medium tracking-normal normal-case">{accent}</span>}
    </div>
  );
}

function PriceLine({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={cn('text-[13px]', muted ? 'text-fg-muted' : 'text-fg-default')}>{label}</span>
      <span className={cn('text-[13px] tabular-nums text-fg-default', bold && 'font-semibold')}>{value}</span>
    </div>
  );
}

function SaleRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span className={cn('text-[13px] font-medium tabular-nums',
        accent ? 'text-brand-softfg' : 'text-fg-default')}>
        {value}
      </span>
    </div>
  );
}

function NumpadKey({ digit, onPress }: { digit: string; onPress: (d: string) => void }) {
  return (
    <button
      onClick={() => onPress(digit)}
      className={cn(
        'h-11 rounded-[var(--radius-md)] text-[14px] font-medium border focus-ring',
        'transition-colors duration-[140ms] ease-out tabular-nums',
        digit === 'C'
          ? 'bg-error-bg text-error-fg border-[var(--error-border)] hover:brightness-105'
          : digit === '←'
            ? 'bg-bg-elevated text-brand-softfg border-border-default hover:bg-bg-inset'
            : 'bg-bg-surface text-fg-default border-border-default hover:bg-bg-elevated',
      )}
    >
      {digit}
    </button>
  );
}

type MobileStep = 'customer' | 'order' | 'pay';

export default function POSPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Mobile step (only used at < lg) ─────────────────────────────
  const [mobileStep, setMobileStep] = useState<MobileStep>('order');

  // ── Customer search ──────────────────────────────────────────────
  const [query,      setQuery]      = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 150);

  // ── New customer form ────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [nc, setNc] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [ncErr, setNcErr] = useState('');

  // ── Order ────────────────────────────────────────────────────────
  const [treeType,   setTreeType]   = useState<TreeType>('fraser');
  const [otherSub,   setOtherSub]   = useState('douglas');
  const [otherName,  setOtherName]  = useState('');
  const [sizeIdx,    setSizeIdx]    = useState(1);
  const [stand,      setStand]      = useState(false);
  const [lights,     setLights]     = useState(false);
  const [delivery,   setDelivery]   = useState(false);
  const [df, setDf] = useState({
    addressLine1: '', city: '', state: '', zip: '',
    deliveryDate: '', timeWindow: 'anytime' as TimeWindow,
    installRequested: false, specialInstructions: '',
  });
  const [notes, setNotes] = useState('');

  // ── Pricing ──────────────────────────────────────────────────────
  const [calcRaw,   setCalcRaw]   = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [cashRaw,   setCashRaw]   = useState('');

  // ── Sale result ──────────────────────────────────────────────────
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);

  // ── tRPC ─────────────────────────────────────────────────────────
  const { data: results = [], isFetching } = trpc.customers.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 && !showNew }
  );

  const { data: cust } = trpc.customers.getById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const { data: org } = trpc.orgs.getCurrent.useQuery(
    undefined,
    { staleTime: Infinity }
  );

  const createCust = trpc.customers.create.useMutation({
    onSuccess: (c) => {
      setSelectedId(c.id);
      setShowNew(false);
      setNc({ firstName: '', lastName: '', phone: '', email: '' });
      setNcErr('');
      setQuery('');
      notify.success('Customer created');
    },
    onError: (e) => {
      notify.error('Could not create customer', { description: e.message });
    },
  });

  // Sale success is announced by the full-screen result card, so no
  // success toast here — it would double-celebrate. Errors keep the
  // cashier on the order screen, so a toast is the only signal.
  const createPurchase = trpc.purchases.create.useMutation({
    onError: (e) => {
      notify.error('Sale could not be completed', { description: e.message });
    },
  });

  // Auto-advance to 'order' tab when a customer is selected (mobile only).
  useEffect(() => {
    if (selectedId) setMobileStep((prev) => (prev === 'customer' ? 'order' : prev));
  }, [selectedId]);

  // Pre-fill delivery address from the customer record when delivery is
  // toggled on. Skipped if any delivery field has already been typed —
  // we won't overwrite the cashier's edits.
  useEffect(() => {
    if (!delivery || !cust) return;
    if (df.addressLine1 || df.city || df.state || df.zip) return;
    setDf((prev) => ({
      ...prev,
      addressLine1: cust.addressLine1 ?? '',
      city:         cust.city ?? '',
      state:        cust.state ?? '',
      zip:          cust.zip ?? '',
    }));
  }, [delivery, cust, df.addressLine1, df.city, df.state, df.zip]);

  // ── Derived values ───────────────────────────────────────────────
  const taxRateBps      = org?.taxRateBps ?? 825;
  const subtotalDollars = calcRaw ? parseInt(calcRaw, 10) : 0;
  const subtotalCents   = subtotalDollars * 100;
  const taxCents        = Math.round((subtotalCents * taxRateBps) / 10000);
  const totalCents      = subtotalCents + taxCents;
  const cashDollars     = cashRaw ? parseInt(cashRaw, 10) : 0;
  const change          = cashDollars - totalCents / 100;

  const deliveryOk = !delivery || Boolean(
    df.addressLine1 && df.city && df.state && df.zip && df.deliveryDate
  );
  const canComplete =
    !!selectedId &&
    subtotalCents > 0 &&
    !!payMethod &&
    (payMethod !== 'cash' || cashRaw !== '') &&
    deliveryOk;

  // ── Helpers ──────────────────────────────────────────────────────
  function treeTypeLabel(): string {
    if (treeType === 'fraser') return 'Fraser Fir';
    if (treeType === 'noble') return 'Noble Fir';
    if (otherSub === 'custom') return otherName || 'Other';
    return OTHER_SUBS.find(s => s.key === otherSub)?.label ?? 'Other';
  }

  function applyCombo(c: typeof COMBOS[number]) {
    setTreeType(c.type);
    setSizeIdx(c.sizeIdx);
    setStand(c.stand);
    setLights(c.lights);
  }

  function completeSale() {
    if (!selectedId || !payMethod || !canComplete) return;

    const custName  = cust ? `${cust.firstName} ${cust.lastName}` : '';
    const treeLabel = treeTypeLabel();
    const szLabel   = SIZES[sizeIdx];
    const pm        = payMethod;

    createPurchase.mutate(
      {
        customerId:        selectedId,
        seasonYear:        SEASON_YEAR,
        treeType:          treeType === 'fraser' ? 'Fraser Fir' : treeType === 'noble' ? 'Noble Fir' : 'Other',
        treeTypeName:      treeType === 'other' ? treeTypeLabel() : undefined,
        treeSizeRange:     SIZES[sizeIdx],
        subtotalCents,
        paymentMethod:     payMethod,
        standIncluded:     stand,
        lightsIncluded:    lights,
        deliveryRequested: delivery,
        notes:             notes || undefined,
        delivery: delivery ? {
          addressLine1:        df.addressLine1,
          city:                df.city,
          state:               df.state,
          zip:                 df.zip,
          deliveryDate:        df.deliveryDate,
          timeWindow:          df.timeWindow,
          installRequested:    df.installRequested,
          specialInstructions: df.specialInstructions || undefined,
        } : undefined,
      },
      {
        onSuccess: (data) => {
          setSaleResult({
            purchaseId:   data.purchase.id,
            deliveryId:   data.delivery?.id ?? null,
            deliveryDate: data.delivery ? df.deliveryDate : null,
            customerName: custName,
            treeLabel,
            sizeLabel:    szLabel,
            totalCents:   data.purchase.totalCents,
            payMethod:    pm,
          });
        },
      }
    );
  }

  function newSale() {
    setSaleResult(null);
    setSelectedId(null);
    setQuery('');
    setCalcRaw('');
    setCashRaw('');
    setPayMethod(null);
    setTreeType('fraser');
    setSizeIdx(1);
    setStand(false);
    setLights(false);
    setDelivery(false);
    setDf({ addressLine1: '', city: '', state: '', zip: '', deliveryDate: '', timeWindow: 'anytime', installRequested: false, specialInstructions: '' });
    setNotes('');
    setMobileStep('customer');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Mobile tab status indicators ─────────────────────────────────
  const customerDone = !!selectedId;
  const orderDone    = subtotalCents > 0;
  const payDone      = !!payMethod && (payMethod !== 'cash' || cashRaw !== '');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={cn('flex h-full overflow-hidden bg-bg-app lg:pb-0', saleResult ? 'pb-0' : 'pb-16')}>

      {/* ══════════════════════════════════════════════════════════════
          LEFT — Customer search
      ══════════════════════════════════════════════════════════════ */}
      <aside
        className={cn(
          'flex-col flex-shrink-0 lg:w-[260px] w-full lg:border-r lg:border-border-default bg-bg-surface',
          'lg:flex',
          mobileStep === 'customer' && !saleResult ? 'flex' : 'hidden lg:flex',
        )}
      >
        {showNew ? (
          <div className="p-3 border-b border-border-default flex items-center gap-2">
            <button
              onClick={() => { setShowNew(false); setNcErr(''); }}
              className="text-[12px] text-fg-muted hover:text-fg-default focus-ring rounded px-1"
            >
              ← Back
            </button>
            <span className="text-[13px] font-semibold text-fg-default">New Customer</span>
          </div>
        ) : (
          <div className="p-3 border-b border-border-default">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search customers…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
              autoFocus
              leading={
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              trailing={isFetching ? <span className="text-[11px] text-fg-subtle">···</span> : null}
            />
          </div>
        )}

        {showNew ? (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
            {(['firstName', 'lastName', 'phone', 'email'] as const).map((field) => (
              <div key={field}>
                <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">
                  {field === 'firstName' ? 'First name *'
                    : field === 'lastName'  ? 'Last name *'
                    : field === 'phone'     ? 'Phone *'
                    : 'Email'}
                </label>
                <Input
                  type={field === 'email' ? 'email' : 'text'}
                  inputSize="sm"
                  value={nc[field]}
                  onChange={(e) => setNc(p => ({ ...p, [field]: e.target.value }))}
                />
              </div>
            ))}
            {ncErr && <div className="text-[12px] text-error-fg">{ncErr}</div>}
            <Button
              fullWidth
              variant="primary"
              loading={createCust.isPending}
              onClick={() => {
                setNcErr('');
                if (!nc.firstName.trim() || !nc.lastName.trim() || !nc.phone.trim()) {
                  setNcErr('First name, last name, and phone are required.');
                  return;
                }
                createCust.mutate({
                  firstName: nc.firstName.trim(),
                  lastName:  nc.lastName.trim(),
                  phone:     nc.phone.trim(),
                  email:     nc.email.trim() || undefined,
                });
              }}
            >
              {createCust.isPending ? 'Saving…' : 'Create Customer'}
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {debouncedQuery.length === 0 && (
              <div className="flex items-center justify-center h-32 text-[12px] text-center px-4 text-fg-subtle">
                Type a name, phone,<br />or email to search
              </div>
            )}
            {debouncedQuery.length > 0 && !isFetching && results.length === 0 && (
              <div className="flex items-center justify-center h-32 text-[12px] text-fg-subtle">
                No customers found
              </div>
            )}
            {results.map((c) => {
              const isSel = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border-subtle transition-colors duration-[140ms] ease-out focus-ring',
                    isSel
                      ? 'bg-brand-soft border-l-2 border-l-brand pl-[10px]'
                      : 'hover:bg-bg-elevated',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-[13px] font-semibold truncate',
                      isSel ? 'text-brand-softfg' : 'text-fg-default')}>
                      {c.firstName} {c.lastName}
                    </span>
                    {c.seasonsCount > 0 && (
                      <Badge variant="brand" size="sm">{c.seasonsCount}× returning</Badge>
                    )}
                  </div>
                  <div className="text-[11.5px] mt-0.5 truncate text-fg-muted tabular-nums">
                    {c.phone}{c.email ? ` · ${c.email}` : ''}
                  </div>
                  {c.lastTreeType && (
                    <div className="text-[11px] mt-0.5 text-brand-softfg">
                      Last: {c.lastTreeType}
                      {c.lastTreeSize ? ` ${c.lastTreeSize}` : ''}
                      {c.lastTotalCents ? ` — ${fmt(c.lastTotalCents)}` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!showNew && (
          <div className="p-3 border-t border-border-default">
            <Button
              fullWidth
              variant="primary"
              onClick={() => { setShowNew(true); setSelectedId(null); setQuery(''); }}
            >
              + New Customer
            </Button>
          </div>
        )}
      </aside>

      {/* ══════════════════════════════════════════════════════════════
          CENTER — Order builder  (or sale success)
      ══════════════════════════════════════════════════════════════ */}
      {saleResult ? (
        <div className="flex-1 flex items-center justify-center p-8 w-full">
          <Card variant="elevated" radius="xl" padding="lg" className="w-full max-w-sm">
            <div className="text-center mb-5">
              <div
                className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center text-[22px] font-semibold bg-brand text-brand-fg"
                aria-hidden
              >✓</div>
              <div className="text-[18px] font-semibold tracking-tight text-fg-default">Sale complete</div>
            </div>
            <div className="border-t border-b border-border-subtle py-3 mb-5">
              <SaleRow label="Customer" value={saleResult.customerName} />
              <SaleRow label="Tree"     value={`${saleResult.treeLabel} ${saleResult.sizeLabel}`} />
              <SaleRow label="Total"    value={fmt(saleResult.totalCents)} accent />
              <SaleRow
                label="Payment"
                value={saleResult.payMethod.charAt(0).toUpperCase() + saleResult.payMethod.slice(1)}
              />
              {saleResult.deliveryId && <SaleRow label="Delivery" value="Scheduled ✓" accent />}
            </div>
            <div className="flex flex-col gap-2">
              {saleResult.deliveryId && (
                <Link
                  href={{
                    pathname: '/deliveries',
                    query: {
                      ...(saleResult.deliveryDate ? { date: saleResult.deliveryDate } : {}),
                      focus: saleResult.deliveryId,
                    },
                  }}
                  className="block w-full"
                >
                  <Button fullWidth variant="primary">View in deliveries →</Button>
                </Link>
              )}
              <Button fullWidth variant="secondary" onClick={newSale}>New sale</Button>
            </div>
          </Card>
        </div>
      ) : (
        <div
          className={cn(
            'flex-1 flex-col overflow-hidden lg:border-r lg:border-border-default bg-bg-app w-full',
            'lg:flex',
            mobileStep === 'order' ? 'flex' : 'hidden lg:flex',
          )}
        >
          {/* Customer header */}
          <div className="p-4 border-b border-border-default flex-shrink-0 bg-bg-surface">
            {cust ? (
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[16px] font-semibold tracking-tight text-fg-default">
                    {cust.firstName} {cust.lastName}
                  </div>
                  <div className="text-[13px] mt-0.5 text-brand-softfg tabular-nums">{cust.phone}</div>
                  {cust.email && (
                    <div className="text-[11.5px] mt-0.5 text-fg-muted">{cust.email}</div>
                  )}
                </div>
                {cust.purchases.length > 0 && (
                  <Badge variant="success" size="md">
                    {cust.purchases.length} past purchase{cust.purchases.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="text-[13px] text-fg-muted">
                {selectedId ? 'Loading…' : 'Select a customer to begin an order'}
              </div>
            )}
          </div>

          {/* Order form */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

            {/* Quick combos */}
            <section>
              <SectionLabel>Quick combos</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {COMBOS.map((c) => (
                  <Button key={c.label} variant="secondary" size="sm" onClick={() => applyCombo(c)} className="!justify-start text-left">
                    {c.label}
                  </Button>
                ))}
              </div>
            </section>

            {/* Tree type */}
            <section>
              <SectionLabel>Tree type</SectionLabel>
              <div className="flex gap-2">
                {(['fraser', 'noble', 'other'] as const).map((t) => (
                  <Button
                    key={t}
                    fullWidth
                    variant={treeType === t ? 'soft' : 'secondary'}
                    onClick={() => setTreeType(t)}
                  >
                    {t === 'fraser' ? 'Fraser Fir' : t === 'noble' ? 'Noble Fir' : 'Other'}
                  </Button>
                ))}
              </div>
              {treeType === 'other' && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {OTHER_SUBS.map((s) => (
                      <Button
                        key={s.key}
                        size="sm"
                        variant={otherSub === s.key ? 'soft' : 'secondary'}
                        onClick={() => setOtherSub(s.key)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                  {otherSub === 'custom' && (
                    <Input
                      type="text"
                      placeholder="Tree variety…"
                      value={otherName}
                      onChange={(e) => setOtherName(e.target.value)}
                    />
                  )}
                </div>
              )}
            </section>

            {/* Size */}
            <section>
              <SectionLabel>Size</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {SIZES.map((s, i) => (
                  <Button
                    key={s}
                    variant={sizeIdx === i ? 'soft' : 'secondary'}
                    onClick={() => setSizeIdx(i)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </section>

            {/* Add-ons */}
            <section>
              <SectionLabel>Add-ons</SectionLabel>
              <div className="flex gap-2">
                <Button fullWidth variant={stand ? 'soft' : 'secondary'} onClick={() => setStand(!stand)}>
                  {stand ? '✓ ' : ''}Stand
                </Button>
                <Button fullWidth variant={lights ? 'soft' : 'secondary'} onClick={() => setLights(!lights)}>
                  {lights ? '✓ ' : ''}Lights
                </Button>
              </div>
            </section>

            {/* Delivery */}
            <section>
              <SectionLabel>Delivery</SectionLabel>
              <Button
                fullWidth
                variant={delivery ? 'soft' : 'secondary'}
                onClick={() => setDelivery(!delivery)}
              >
                {delivery ? '✓ Delivery requested' : 'Request delivery'}
              </Button>

              {delivery && (
                <Card variant="inset" padding="sm" radius="md" className="mt-3 flex flex-col gap-2.5">
                  <div>
                    <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">Address *</label>
                    <Input inputSize="sm" placeholder="123 Main St" value={df.addressLine1}
                      onChange={(e) => setDf(p => ({ ...p, addressLine1: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">City *</label>
                      <Input inputSize="sm" value={df.city}
                        onChange={(e) => setDf(p => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div className="w-[56px]">
                      <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">St *</label>
                      <Input inputSize="sm" maxLength={2} value={df.state} className="text-center"
                        onChange={(e) => setDf(p => ({ ...p, state: e.target.value.toUpperCase() }))} />
                    </div>
                    <div className="w-[80px]">
                      <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">Zip *</label>
                      <Input inputSize="sm" maxLength={5} value={df.zip}
                        onChange={(e) => setDf(p => ({ ...p, zip: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">Date *</label>
                      <Input inputSize="sm" type="date" value={df.deliveryDate}
                        onChange={(e) => setDf(p => ({ ...p, deliveryDate: e.target.value }))} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">Time window</label>
                      <Select selectSize="sm" value={df.timeWindow}
                        onChange={(e) => setDf(p => ({ ...p, timeWindow: e.target.value as TimeWindow }))}>
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                        <option value="anytime">Anytime</option>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={df.installRequested ? 'soft' : 'secondary'}
                    onClick={() => setDf(p => ({ ...p, installRequested: !p.installRequested }))}
                    className="!justify-start"
                  >
                    {df.installRequested ? '✓ ' : ''}Install requested
                  </Button>
                  <div>
                    <label className="block text-[10.5px] font-medium uppercase tracking-wider text-fg-muted mb-1">Special instructions</label>
                    <textarea
                      rows={2}
                      placeholder="Gate code, dogs, ring doorbell, etc."
                      value={df.specialInstructions}
                      onChange={(e) => setDf(p => ({ ...p, specialInstructions: e.target.value }))}
                      className="w-full rounded-[var(--radius-md)] px-3 py-2 text-[13px] outline-none resize-none bg-bg-surface border border-border-default text-fg-default placeholder:text-fg-subtle focus-ring focus:border-border-brand transition-[border-color,box-shadow] duration-[140ms] ease-out"
                    />
                  </div>
                </Card>
              )}
            </section>

            {/* Notes */}
            <section>
              <SectionLabel>Notes</SectionLabel>
              <textarea
                rows={2}
                placeholder="Any notes for this sale…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-[var(--radius-md)] px-3 py-2 text-[13px] outline-none resize-none bg-bg-surface border border-border-default text-fg-default placeholder:text-fg-subtle focus-ring focus:border-border-brand transition-[border-color,box-shadow] duration-[140ms] ease-out"
              />
            </section>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          RIGHT — Payment calculator
      ══════════════════════════════════════════════════════════════ */}
      {!saleResult && (
        <div
          className={cn(
            'flex-col flex-shrink-0 lg:w-[300px] w-full overflow-y-auto p-4 gap-4 bg-bg-surface',
            'lg:flex',
            mobileStep === 'pay' ? 'flex' : 'hidden lg:flex',
          )}
        >
          <Card variant="surface" padding="md">
            <PriceLine label="Subtotal" value={fmt(subtotalCents)} muted />
            <PriceLine label={`Tax (${(taxRateBps / 100).toFixed(2)}%)`} value={fmt(taxCents)} muted />
            <div className="border-t border-border-subtle my-2" />
            <PriceLine label="Total" value={fmt(totalCents)} bold />
          </Card>

          <div>
            <SectionLabel>Price presets</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {PRICE_PRESETS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={calcRaw === String(p) ? 'soft' : 'secondary'}
                  onClick={() => {
                    setCalcRaw(String(p));
                    // One-tap price = the cashier knows the total. Advance to
                    // pay on mobile so they don't have to hunt for the tab.
                    // Numpad typing intentionally does NOT trigger this — it
                    // would yank them away mid-keying.
                    setMobileStep((prev) => (prev === 'order' ? 'pay' : prev));
                  }}
                  className="tabular-nums"
                >
                  ${p}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel accent={`$${subtotalDollars || '0'}.00`}>Amount</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {NUMPAD_KEYS.map((d) => (
                <NumpadKey key={d} digit={d} onPress={(k) => setCalcRaw(numpadPress(calcRaw, k))} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Payment method</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(['cash', 'card', 'venmo', 'zelle'] as const).map((m) => (
                <Button
                  key={m}
                  variant={payMethod === m ? 'soft' : 'secondary'}
                  onClick={() => setPayMethod(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {payMethod === 'cash' && (
            <Card variant="inset" padding="sm" radius="md" className="flex flex-col gap-2">
              <SectionLabel>Cash tendered</SectionLabel>
              <div className="flex flex-wrap gap-1.5 -mt-1.5">
                {CASH_PRESETS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={cashRaw === String(p) ? 'soft' : 'secondary'}
                    onClick={() => setCashRaw(String(p))}
                    className="tabular-nums"
                  >
                    ${p}
                  </Button>
                ))}
                {totalCents > 0 && Math.ceil(totalCents / 100) > 300 && (
                  <Button
                    size="sm"
                    variant={cashRaw === String(Math.ceil(totalCents / 100)) ? 'soft' : 'secondary'}
                    onClick={() => setCashRaw(String(Math.ceil(totalCents / 100)))}
                  >
                    Exact
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {NUMPAD_KEYS.map((d) => (
                  <NumpadKey key={d} digit={d} onPress={(k) => setCashRaw(numpadPress(cashRaw, k))} />
                ))}
              </div>
              {cashRaw !== '' && (
                <div className="text-center text-[14px] font-semibold pt-1 tabular-nums">
                  {change >= 0 ? (
                    <span className="text-brand-softfg">Change: ${change.toFixed(2)}</span>
                  ) : (
                    <span className="text-error-fg">Short: ${Math.abs(change).toFixed(2)}</span>
                  )}
                </div>
              )}
            </Card>
          )}

          <Button
            fullWidth
            size="lg"
            variant="primary"
            disabled={!canComplete}
            loading={createPurchase.isPending}
            onClick={completeSale}
          >
            {createPurchase.isPending ? 'Processing…' : 'Complete Sale'}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MOBILE — Bottom tab bar (Customer / Order / Pay)
      ══════════════════════════════════════════════════════════════ */}
      {!saleResult && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 lg:hidden flex bg-bg-surface border-t border-border-default"
          aria-label="POS sections"
        >
          {(
            [
              { key: 'customer', label: 'Customer', done: customerDone },
              { key: 'order',    label: 'Order',    done: orderDone    },
              { key: 'pay',      label: 'Pay',      done: payDone      },
            ] as const
          ).map((tab) => {
            const active = mobileStep === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMobileStep(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex-1 py-3 flex flex-col items-center justify-center gap-0.5 text-[12px] font-medium focus-ring transition-colors',
                  active
                    ? 'text-brand-softfg border-t-2 border-t-brand'
                    : 'text-fg-muted border-t-2 border-t-transparent',
                )}
              >
                <span>{tab.label}</span>
                {tab.done ? (
                  <span className="text-[11px] leading-none text-success-fg" aria-hidden>✓</span>
                ) : (
                  <span
                    className="block w-1 h-1 rounded-full bg-fg-subtle"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
