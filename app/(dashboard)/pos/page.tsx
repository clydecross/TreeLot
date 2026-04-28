'use client';

import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

// Phase 4 test constants — replaced with real org context in Phase 5
const TEST_ORG_ID      = 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';
const TEST_LOCATION_ID = '728060d6-4239-4622-ae0d-1f0b6fbb5d9a';
const TEST_USER_ID     = '877ddf10-efd5-4dcd-9ce5-a8c7de3c7044';
const SEASON_YEAR      = 2026;

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

type TreeType = 'fraser' | 'noble' | 'other';
type PayMethod = 'cash' | 'card' | 'venmo' | 'zelle';
type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'anytime';

interface SaleResult {
  purchaseId:   string;
  deliveryId:   string | null;
  customerName: string;
  treeLabel:    string;
  sizeLabel:    string;
  totalCents:   number;
  payMethod:    PayMethod;
}

function PriceLine({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-sm" style={{ color: muted ? '#5F5E5A' : '#E8E6E0' }}>{label}</span>
      <span className="text-sm" style={{ color: '#E8E6E0', fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function SaleRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm" style={{ color: '#5F5E5A' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: accent ? '#9FE1CB' : '#E8E6E0' }}>{value}</span>
    </div>
  );
}

export default function POSPage() {
  const inputRef = useRef<HTMLInputElement>(null);

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
    { query: debouncedQuery, orgId: TEST_ORG_ID },
    { enabled: debouncedQuery.length > 0 && !showNew }
  );

  const { data: cust } = trpc.customers.getById.useQuery(
    { id: selectedId!, orgId: TEST_ORG_ID },
    { enabled: !!selectedId }
  );

  const { data: org } = trpc.orgs.getById.useQuery(
    { id: TEST_ORG_ID },
    { staleTime: Infinity }
  );

  const createCust = trpc.customers.create.useMutation({
    onSuccess: (c) => {
      setSelectedId(c.id);
      setShowNew(false);
      setNc({ firstName: '', lastName: '', phone: '', email: '' });
      setNcErr('');
      setQuery('');
    },
    onError: (e) => setNcErr(e.message),
  });

  const createPurchase = trpc.purchases.create.useMutation();

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

    // Capture display values at call time to avoid stale closure in onSuccess
    const custName  = cust ? `${cust.firstName} ${cust.lastName}` : '';
    const treeLabel = treeTypeLabel();
    const szLabel   = SIZES[sizeIdx];
    const pm        = payMethod;

    createPurchase.mutate(
      {
        customerId:        selectedId,
        locationId:        TEST_LOCATION_ID,
        createdById:       TEST_USER_ID,
        seasonYear:        SEASON_YEAR,
        treeType:          treeType === 'fraser' ? 'Fraser Fir' : treeType === 'noble' ? 'Noble Fir' : 'Other',
        treeTypeName:      treeType === 'other' ? treeTypeLabel() : undefined,
        treeSizeRange:     SIZES[sizeIdx],
        subtotalCents,
        taxRateBps,
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
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Styles helpers ────────────────────────────────────────────────
  const btnActive   = { background: '#27500A', color: '#9FE1CB', border: '1px solid #3d7a12' } as const;
  const btnInactive = { background: '#252521', color: '#E8E6E0', border: '1px solid #2e2e2a' } as const;
  function toggleStyle(active: boolean) { return active ? btnActive : btnInactive; }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#1a1a18' }}>

      {/* ══════════════════════════════════════════════════════════════
          LEFT PANEL — Customer search
      ══════════════════════════════════════════════════════════════ */}
      <aside
        className="flex flex-col flex-shrink-0 border-r"
        style={{ width: 250, borderColor: '#2e2e2a' }}
      >
        {/* Header */}
        {showNew ? (
          <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: '#2e2e2a' }}>
            <button
              onClick={() => { setShowNew(false); setNcErr(''); }}
              className="text-xs"
              style={{ color: '#5F5E5A' }}
            >
              ← Back
            </button>
            <span className="text-sm font-medium" style={{ color: '#E8E6E0' }}>New Customer</span>
          </div>
        ) : (
          <div className="p-3 border-b" style={{ borderColor: '#2e2e2a' }}>
            <div
              className="flex items-center gap-2 rounded px-3"
              style={{ background: '#252521', height: 34 }}
            >
              <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="#5F5E5A" strokeWidth="1.5" />
                <path d="M11 11L14.5 14.5" stroke="#5F5E5A" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search customers…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: '#E8E6E0', caretColor: '#7CB542' }}
                autoFocus
              />
              {isFetching && <span className="text-xs" style={{ color: '#5F5E5A' }}>···</span>}
            </div>
          </div>
        )}

        {/* New customer form */}
        {showNew ? (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {(['firstName', 'lastName', 'phone', 'email'] as const).map((field) => (
              <div key={field}>
                <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>
                  {field === 'firstName' ? 'First name *'
                    : field === 'lastName' ? 'Last name *'
                    : field === 'phone' ? 'Phone *'
                    : 'Email'}
                </label>
                <input
                  type={field === 'email' ? 'email' : 'text'}
                  value={nc[field]}
                  onChange={(e) => setNc(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full rounded px-2 py-1.5 text-sm outline-none"
                  style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                />
              </div>
            ))}
            {ncErr && <div className="text-xs" style={{ color: '#ef8888' }}>{ncErr}</div>}
            <button
              disabled={createCust.isPending}
              onClick={() => {
                setNcErr('');
                if (!nc.firstName.trim() || !nc.lastName.trim() || !nc.phone.trim()) {
                  setNcErr('First name, last name, and phone are required.');
                  return;
                }
                createCust.mutate({
                  orgId:     TEST_ORG_ID,
                  firstName: nc.firstName.trim(),
                  lastName:  nc.lastName.trim(),
                  phone:     nc.phone.trim(),
                  email:     nc.email.trim() || undefined,
                });
              }}
              className="w-full rounded text-sm font-medium py-2 mt-1"
              style={{ ...btnActive, opacity: createCust.isPending ? 0.6 : 1 }}
            >
              {createCust.isPending ? 'Saving…' : 'Create Customer'}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {debouncedQuery.length === 0 && (
              <div
                className="flex items-center justify-center h-32 text-xs text-center px-4"
                style={{ color: '#5F5E5A' }}
              >
                Type a name, phone,<br />or email to search
              </div>
            )}
            {debouncedQuery.length > 0 && !isFetching && results.length === 0 && (
              <div className="flex items-center justify-center h-32 text-xs" style={{ color: '#5F5E5A' }}>
                No customers found
              </div>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left px-3 py-2.5 border-b transition-colors"
                style={{
                  borderColor: '#2e2e2a',
                  background: selectedId === c.id ? '#252521' : 'transparent',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate" style={{ color: '#E8E6E0' }}>
                    {c.firstName} {c.lastName}
                  </span>
                  {c.seasonsCount > 0 && (
                    <span className="text-xs ml-1 flex-shrink-0" style={{ color: '#7CB542' }}>
                      {c.seasonsCount}× returning
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: '#5F5E5A' }}>
                  {c.phone}{c.email ? ` · ${c.email}` : ''}
                </div>
                {c.lastTreeType && (
                  <div className="text-xs mt-0.5" style={{ color: '#4a7a2a' }}>
                    Last: {c.lastTreeType}
                    {c.lastTreeSize ? ` ${c.lastTreeSize}` : ''}
                    {c.lastTotalCents ? ` — ${fmt(c.lastTotalCents)}` : ''}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* New customer button */}
        {!showNew && (
          <div className="p-3 border-t" style={{ borderColor: '#2e2e2a' }}>
            <button
              onClick={() => { setShowNew(true); setSelectedId(null); setQuery(''); }}
              className="w-full rounded text-sm font-medium py-2"
              style={btnActive}
            >
              + New Customer
            </button>
          </div>
        )}
      </aside>

      {/* ══════════════════════════════════════════════════════════════
          CENTER PANEL — Order builder  (or sale success)
      ══════════════════════════════════════════════════════════════ */}
      {saleResult ? (
        /* ── SUCCESS STATE ──────────────────────────────────────────── */
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="w-full max-w-sm rounded-xl p-6"
            style={{ background: '#252521', border: '1px solid #2e2e2a' }}
          >
            <div className="text-center mb-5">
              <div className="text-4xl mb-2" style={{ color: '#7CB542' }}>✓</div>
              <div className="text-lg font-semibold" style={{ color: '#9FE1CB' }}>Sale complete!</div>
            </div>
            <div className="flex flex-col border-t border-b py-3 mb-5" style={{ borderColor: '#2e2e2a' }}>
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
                <a
                  href="/deliveries"
                  className="block w-full text-center rounded py-2 text-sm font-medium"
                  style={btnActive}
                >
                  View in deliveries →
                </a>
              )}
              <button
                onClick={newSale}
                className="w-full rounded py-2 text-sm font-medium"
                style={btnInactive}
              >
                New sale
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── ORDER BUILDER ──────────────────────────────────────────── */
        <div
          className="flex-1 flex flex-col overflow-hidden border-r"
          style={{ borderColor: '#2e2e2a' }}
        >
          {/* Customer header */}
          <div className="p-4 border-b flex-shrink-0" style={{ borderColor: '#2e2e2a' }}>
            {cust ? (
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold" style={{ color: '#E8E6E0' }}>
                    {cust.firstName} {cust.lastName}
                  </div>
                  <div className="text-sm mt-0.5" style={{ color: '#9FE1CB' }}>{cust.phone}</div>
                  {cust.email && (
                    <div className="text-xs mt-0.5" style={{ color: '#5F5E5A' }}>{cust.email}</div>
                  )}
                </div>
                {cust.purchases.length > 0 && (
                  <div
                    className="text-xs px-2 py-1 rounded flex-shrink-0"
                    style={{ background: '#1a1a18', color: '#7CB542', border: '1px solid #2e2e2a' }}
                  >
                    {cust.purchases.length} past purchase{cust.purchases.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm" style={{ color: '#5F5E5A' }}>
                {selectedId ? 'Loading…' : 'Select a customer to begin an order'}
              </div>
            )}
          </div>

          {/* Order form */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

            {/* Quick combos */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                QUICK COMBOS
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {COMBOS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => applyCombo(c)}
                    className="text-left px-2.5 py-2 rounded text-xs leading-snug"
                    style={btnInactive}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Tree type */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                TREE TYPE
              </div>
              <div className="flex gap-2">
                {(['fraser', 'noble', 'other'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTreeType(t)}
                    className="flex-1 py-2.5 rounded text-sm font-medium"
                    style={toggleStyle(treeType === t)}
                  >
                    {t === 'fraser' ? 'Fraser Fir' : t === 'noble' ? 'Noble Fir' : 'Other'}
                  </button>
                ))}
              </div>
              {treeType === 'other' && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {OTHER_SUBS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setOtherSub(s.key)}
                        className="px-2.5 py-1 rounded text-xs"
                        style={toggleStyle(otherSub === s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {otherSub === 'custom' && (
                    <input
                      type="text"
                      placeholder="Tree variety…"
                      value={otherName}
                      onChange={(e) => setOtherName(e.target.value)}
                      className="w-full rounded px-3 py-2 text-sm outline-none"
                      style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                    />
                  )}
                </div>
              )}
            </section>

            {/* Size */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                SIZE
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {SIZES.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setSizeIdx(i)}
                    className="py-2 rounded text-sm font-medium"
                    style={toggleStyle(sizeIdx === i)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            {/* Add-ons */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                ADD-ONS
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStand(!stand)}
                  className="flex-1 py-2 rounded text-sm font-medium"
                  style={toggleStyle(stand)}
                >
                  {stand ? '✓ ' : ''}Stand
                </button>
                <button
                  onClick={() => setLights(!lights)}
                  className="flex-1 py-2 rounded text-sm font-medium"
                  style={toggleStyle(lights)}
                >
                  {lights ? '✓ ' : ''}Lights
                </button>
              </div>
            </section>

            {/* Delivery */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                DELIVERY
              </div>
              <button
                onClick={() => setDelivery(!delivery)}
                className="w-full py-2 rounded text-sm font-medium"
                style={toggleStyle(delivery)}
              >
                {delivery ? '✓ Delivery requested' : 'Request delivery'}
              </button>

              {delivery && (
                <div
                  className="mt-3 rounded-lg p-3 flex flex-col gap-2"
                  style={{ background: '#1e1e1c', border: '1px solid #2e2e2a' }}
                >
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>Address *</label>
                    <input
                      type="text"
                      placeholder="123 Main St"
                      value={df.addressLine1}
                      onChange={(e) => setDf(p => ({ ...p, addressLine1: e.target.value }))}
                      className="w-full rounded px-2 py-1.5 text-sm outline-none"
                      style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>City *</label>
                      <input
                        type="text"
                        value={df.city}
                        onChange={(e) => setDf(p => ({ ...p, city: e.target.value }))}
                        className="w-full rounded px-2 py-1.5 text-sm outline-none"
                        style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                      />
                    </div>
                    <div style={{ width: 48 }}>
                      <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>St *</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={df.state}
                        onChange={(e) => setDf(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                        className="w-full rounded px-2 py-1.5 text-sm outline-none text-center"
                        style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                      />
                    </div>
                    <div style={{ width: 72 }}>
                      <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>Zip *</label>
                      <input
                        type="text"
                        maxLength={5}
                        value={df.zip}
                        onChange={(e) => setDf(p => ({ ...p, zip: e.target.value }))}
                        className="w-full rounded px-2 py-1.5 text-sm outline-none"
                        style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>Date *</label>
                      <input
                        type="date"
                        value={df.deliveryDate}
                        onChange={(e) => setDf(p => ({ ...p, deliveryDate: e.target.value }))}
                        className="w-full rounded px-2 py-1.5 text-sm outline-none"
                        style={{
                          background: '#252521',
                          border: '1px solid #2e2e2a',
                          color: '#E8E6E0',
                          colorScheme: 'dark',
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>Time window</label>
                      <select
                        value={df.timeWindow}
                        onChange={(e) => setDf(p => ({ ...p, timeWindow: e.target.value as TimeWindow }))}
                        className="w-full rounded px-2 py-1.5 text-sm outline-none"
                        style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                      >
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                        <option value="anytime">Anytime</option>
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={() => setDf(p => ({ ...p, installRequested: !p.installRequested }))}
                    className="text-left px-2.5 py-2 rounded text-xs"
                    style={toggleStyle(df.installRequested)}
                  >
                    {df.installRequested ? '✓ ' : ''}Install requested
                  </button>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5F5E5A' }}>
                      Special instructions
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Gate code, dogs, ring doorbell, etc."
                      value={df.specialInstructions}
                      onChange={(e) => setDf(p => ({ ...p, specialInstructions: e.target.value }))}
                      className="w-full rounded px-2 py-1.5 text-sm outline-none resize-none"
                      style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Notes */}
            <section>
              <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
                NOTES
              </div>
              <textarea
                rows={2}
                placeholder="Any notes for this sale…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none resize-none"
                style={{ background: '#252521', border: '1px solid #2e2e2a', color: '#E8E6E0' }}
              />
            </section>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          RIGHT PANEL — Payment calculator
      ══════════════════════════════════════════════════════════════ */}
      {!saleResult && (
        <div
          className="flex flex-col flex-shrink-0 overflow-y-auto p-4 gap-4"
          style={{ width: 280 }}
        >
          {/* Price display */}
          <div className="rounded-lg p-4" style={{ background: '#252521', border: '1px solid #2e2e2a' }}>
            <PriceLine label="Subtotal" value={fmt(subtotalCents)} muted />
            <PriceLine label={`Tax (${(taxRateBps / 100).toFixed(2)}%)`} value={fmt(taxCents)} muted />
            <div className="border-t my-2" style={{ borderColor: '#2e2e2a' }} />
            <PriceLine label="Total" value={fmt(totalCents)} bold />
          </div>

          {/* Price presets */}
          <div>
            <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
              PRICE PRESETS
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRICE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setCalcRaw(String(p))}
                  className="py-1.5 rounded text-sm"
                  style={toggleStyle(calcRaw === String(p))}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>

          {/* Price numpad */}
          <div>
            <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
              AMOUNT —{' '}
              <span style={{ color: '#E8E6E0' }}>
                ${subtotalDollars || '0'}.00
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {NUMPAD_KEYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setCalcRaw(numpadPress(calcRaw, d))}
                  className="py-3 rounded text-sm font-medium"
                  style={{
                    background: d === 'C' ? '#2a1818' : '#252521',
                    color: d === 'C' ? '#ef8888' : d === '←' ? '#9FE1CB' : '#E8E6E0',
                    border: '1px solid #2e2e2a',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <div className="text-xs font-medium mb-2 tracking-wide" style={{ color: '#5F5E5A' }}>
              PAYMENT METHOD
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['cash', 'card', 'venmo', 'zelle'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className="py-2 rounded text-sm font-medium"
                  style={toggleStyle(payMethod === m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Cash section */}
          {payMethod === 'cash' && (
            <div
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{ background: '#1e1e1c', border: '1px solid #2e2e2a' }}
            >
              <div className="text-xs font-medium tracking-wide" style={{ color: '#5F5E5A' }}>
                CASH TENDERED
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CASH_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setCashRaw(String(p))}
                    className="px-2 py-1 rounded text-xs"
                    style={toggleStyle(cashRaw === String(p))}
                  >
                    ${p}
                  </button>
                ))}
                {totalCents > 0 && Math.ceil(totalCents / 100) > 300 && (
                  <button
                    onClick={() => setCashRaw(String(Math.ceil(totalCents / 100)))}
                    className="px-2 py-1 rounded text-xs"
                    style={toggleStyle(cashRaw === String(Math.ceil(totalCents / 100)))}
                  >
                    Exact
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {NUMPAD_KEYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setCashRaw(numpadPress(cashRaw, d))}
                    className="py-2.5 rounded text-sm"
                    style={{
                      background: d === 'C' ? '#2a1818' : '#252521',
                      color: d === 'C' ? '#ef8888' : d === '←' ? '#9FE1CB' : '#E8E6E0',
                      border: '1px solid #2e2e2a',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {cashRaw !== '' && (
                <div className="text-center text-sm font-semibold pt-1">
                  {change >= 0 ? (
                    <span style={{ color: '#7CB542' }}>Change: ${change.toFixed(2)}</span>
                  ) : (
                    <span style={{ color: '#ef8888' }}>Short: ${Math.abs(change).toFixed(2)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Complete Sale */}
          <button
            onClick={completeSale}
            disabled={!canComplete || createPurchase.isPending}
            className="w-full rounded-lg py-3 text-sm font-semibold"
            style={{
              background: canComplete ? '#7CB542' : '#252521',
              color: canComplete ? '#0a1a04' : '#5F5E5A',
              border: `1px solid ${canComplete ? '#7CB542' : '#2e2e2a'}`,
              cursor: canComplete && !createPurchase.isPending ? 'pointer' : 'not-allowed',
              opacity: createPurchase.isPending ? 0.6 : 1,
            }}
          >
            {createPurchase.isPending ? 'Processing…' : 'Complete Sale'}
          </button>

          {createPurchase.isError && (
            <div className="text-xs text-center" style={{ color: '#ef8888' }}>
              {createPurchase.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
