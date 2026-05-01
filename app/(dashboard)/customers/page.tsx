'use client';

import { useState, useEffect, useMemo } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/lib/trpc/client';
import type { AppRouter } from '@/server/router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input as UIInput } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

type CustomerDetailData = NonNullable<inferRouterOutputs<AppRouter>['customers']['getById']>;

type SortKey = 'recent' | 'lifetime' | 'name';

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

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CustomersPage() {
  const [query, setQuery]           = useState('');
  const [sort, setSort]             = useState<SortKey>('recent');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing]       = useState(false);

  const debouncedQuery = useDebounce(query, 200);

  // Browse mode (no query): paginated list with sort
  const listQuery = trpc.customers.list.useQuery(
    { sort, limit: 100, offset: 0 },
    { enabled: debouncedQuery.length === 0 }
  );

  // Search mode (typing): fuzzy results
  const searchQuery = trpc.customers.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 }
  );

  const detail = trpc.customers.getById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const utils = trpc.useUtils();
  const updateCust = trpc.customers.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      utils.customers.list.invalidate();
      utils.customers.getById.invalidate();
    },
  });

  // Display rows — unify shape between list and search
  const rows = useMemo(() => {
    if (debouncedQuery.length > 0) {
      return (searchQuery.data ?? []).map((r) => ({
        id:             r.id,
        firstName:      r.firstName,
        lastName:       r.lastName,
        phone:          r.phone,
        email:          r.email,
        city:           null as string | null,
        state:          null as string | null,
        purchaseCount:  r.seasonsCount,
        lifetimeCents:  r.lastTotalCents ?? 0, // fallback — not exact in search mode
        lastPurchaseAt: r.lastPurchaseAt,
        lastTreeType:   r.lastTreeType,
        lastTreeSize:   r.lastTreeSize,
      }));
    }
    return listQuery.data?.rows ?? [];
  }, [debouncedQuery, searchQuery.data, listQuery.data]);

  const total = listQuery.data?.total ?? 0;
  const isLoading = debouncedQuery.length > 0 ? searchQuery.isFetching : listQuery.isFetching;

  return (
    <div className="flex h-full overflow-hidden bg-bg-app">
      {/* ════ LEFT: customer list ════ */}
      <aside
        className={cn(
          'flex flex-col flex-shrink-0 w-full lg:w-[380px] border-r border-border-default bg-bg-surface',
          selectedId && 'hidden lg:flex',
        )}
      >
        {/* Header */}
        <div className="p-3 border-b border-border-default flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-fg-default">
              Customers
            </span>
            <span className="text-xs text-fg-muted">
              {debouncedQuery.length > 0 ? `${rows.length} match${rows.length === 1 ? '' : 'es'}` : `${total} total`}
            </span>
          </div>

          {/* Search */}
          <UIInput
            type="text"
            placeholder="Search name, phone, email…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
            leading={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            trailing={isLoading ? <span className="text-[11px] text-fg-subtle">···</span> : null}
          />

          {/* Sort chips (only in browse mode) */}
          {debouncedQuery.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(['recent', 'lifetime', 'name'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={sort === s ? 'primary' : 'secondary'}
                  onClick={() => setSort(s)}
                  className="flex-1"
                >
                  {s === 'recent' ? 'Recent' : s === 'lifetime' ? 'Top spenders' : 'A–Z'}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {!isLoading && rows.length === 0 && (
            <div className="flex items-center justify-center h-32 text-xs px-4 text-center text-fg-muted">
              {debouncedQuery.length > 0
                ? 'No customers found'
                : 'No customers yet — add some via the POS'}
            </div>
          )}

          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setEditing(false); }}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-border-subtle transition-colors duration-[140ms] ease-out focus-ring',
                selectedId === c.id ? 'bg-bg-elevated' : 'hover:bg-bg-inset',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate text-fg-default">
                  {c.firstName} {c.lastName}
                </span>
                {c.purchaseCount > 0 && (
                  <span className="text-xs flex-shrink-0 text-brand-softfg">
                    {c.purchaseCount} purchase{c.purchaseCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-xs mt-0.5 truncate text-fg-muted">
                {c.phone}{c.email ? ` · ${c.email}` : ''}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-brand-softfg">
                  {c.lastTreeType
                    ? `Last: ${c.lastTreeType}${c.lastTreeSize ? ` ${c.lastTreeSize}` : ''}`
                    : 'No purchases yet'}
                </span>
                {c.lifetimeCents > 0 && (
                  <span className="text-xs font-medium text-brand-softfg">
                    {fmt(c.lifetimeCents)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ════ RIGHT: detail ════ */}
      <main
        className={cn(
          'flex-1 overflow-y-auto p-4 lg:p-6',
          !selectedId && 'hidden lg:block',
        )}
      >
        {!selectedId && (
          <div className="flex items-center justify-center h-full text-fg-muted">
            <div className="text-center">
              <div className="text-base mb-2 text-fg-default">Select a customer</div>
              <div className="text-sm">View profile, purchase history, and edit details</div>
            </div>
          </div>
        )}

        {selectedId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedId(null); setEditing(false); }}
            className="lg:hidden mb-3"
          >
            ← Back to customers
          </Button>
        )}

        {selectedId && detail.isLoading && (
          <div className="text-sm text-fg-muted">Loading…</div>
        )}

        {selectedId && detail.data && !editing && (
          <CustomerDetail
            customer={detail.data}
            onEdit={() => setEditing(true)}
          />
        )}

        {selectedId && detail.data && editing && (
          <CustomerEditForm
            customer={detail.data}
            saving={updateCust.isPending}
            error={updateCust.error?.message ?? null}
            onCancel={() => setEditing(false)}
            onSave={(patch) =>
              updateCust.mutate({ id: detail.data!.id, ...patch })
            }
          />
        )}
      </main>
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────
function CustomerDetail({
  customer,
  onEdit,
}: {
  customer: CustomerDetailData;
  onEdit: () => void;
}) {
  const totalSpent = customer.purchases.reduce((sum, p) => sum + p.totalCents, 0);
  const seasonsSet = new Set(customer.purchases.map((p) => p.seasonYear));

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-semibold text-fg-default">
            {customer.firstName} {customer.lastName}
          </div>
          <div className="text-sm mt-1 text-brand-softfg">{customer.phone}</div>
          {customer.email && (
            <div className="text-sm text-fg-muted">{customer.email}</div>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Lifetime spend" value={fmt(totalSpent)} accent />
        <Stat label="Purchases"      value={String(customer.purchases.length)} />
        <Stat label="Seasons"        value={String(seasonsSet.size)} />
      </div>

      {/* Address */}
      {(customer.addressLine1 || customer.city) && (
        <Card padding="md">
          <div className="text-xs uppercase tracking-wide mb-2 text-fg-muted">
            Address
          </div>
          <div className="text-sm text-fg-default">
            {customer.addressLine1 && <div>{customer.addressLine1}</div>}
            <div>
              {[customer.city, customer.state].filter(Boolean).join(', ')}
              {customer.zip ? ` ${customer.zip}` : ''}
            </div>
          </div>
        </Card>
      )}

      {/* Notes */}
      {customer.notes && (
        <Card padding="md">
          <div className="text-xs uppercase tracking-wide mb-2 text-fg-muted">
            Notes
          </div>
          <div className="text-sm whitespace-pre-wrap text-fg-default">
            {customer.notes}
          </div>
        </Card>
      )}

      {/* Purchase history */}
      <div>
        <div className="text-xs uppercase tracking-wide mb-2 text-fg-muted">
          Purchase history
        </div>
        {customer.purchases.length === 0 ? (
          <Card padding="lg" className="text-center text-sm text-fg-muted">
            No purchases yet.
          </Card>
        ) : (
          <>
            {/* Mobile card-stack */}
            <div className="lg:hidden flex flex-col gap-2">
              {customer.purchases.map((p) => (
                <Card key={p.id} padding="md" variant="surface">
                  <div className="flex items-baseline justify-between">
                    <span className="text-brand-softfg font-semibold">{p.seasonYear}</span>
                    <span className="text-fg-muted text-[12px]">
                      {fmtDate(typeof p.purchasedAt === 'string' ? p.purchasedAt : (p.purchasedAt as Date).toISOString())}
                    </span>
                  </div>
                  <div className="text-fg-default text-[13px] mt-1">
                    {p.treeType}{p.treeTypeName ? ` (${p.treeTypeName})` : ''}
                    <span className="text-fg-muted"> · {p.treeSizeRange}</span>
                  </div>
                  {(p.standIncluded || p.lightsIncluded || p.deliveryRequested) && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {p.standIncluded && <Badge variant="neutral">Stand</Badge>}
                      {p.lightsIncluded && <Badge variant="neutral">Lights</Badge>}
                      {p.deliveryRequested && <Badge variant="brand">Delivery</Badge>}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
                    <span className="text-fg-muted text-[12px] capitalize">{p.paymentMethod}</span>
                    <span className="text-fg-default font-semibold">{fmt(p.totalCents)}</span>
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop table */}
            <Card padding="none" className="hidden lg:block overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg-inset">
                  <tr>
                    <Th>Season</Th>
                    <Th>Date</Th>
                    <Th>Tree</Th>
                    <Th>Add-ons</Th>
                    <Th>Payment</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.purchases.map((p, i) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-t border-border-subtle',
                        i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset',
                      )}
                    >
                      <Td><span className="text-brand-softfg">{p.seasonYear}</span></Td>
                      <Td>{fmtDate(typeof p.purchasedAt === 'string' ? p.purchasedAt : (p.purchasedAt as Date).toISOString())}</Td>
                      <Td>
                        {p.treeType}{p.treeTypeName ? ` (${p.treeTypeName})` : ''}
                        <span className="text-fg-muted"> · {p.treeSizeRange}</span>
                      </Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          {p.standIncluded && <Badge variant="neutral">Stand</Badge>}
                          {p.lightsIncluded && <Badge variant="neutral">Lights</Badge>}
                          {p.deliveryRequested && <Badge variant="brand">Delivery</Badge>}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-fg-muted capitalize">
                          {p.paymentMethod}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="text-fg-default font-medium">{fmt(p.totalCents)}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function CustomerEditForm({
  customer,
  saving,
  error,
  onCancel,
  onSave,
}: {
  customer: CustomerDetailData;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (patch: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    notes?: string | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    firstName:    customer.firstName,
    lastName:     customer.lastName,
    phone:        customer.phone,
    email:        customer.email ?? '',
    addressLine1: customer.addressLine1 ?? '',
    city:         customer.city ?? '',
    state:        customer.state ?? '',
    zip:          customer.zip ?? '',
    notes:        customer.notes ?? '',
  });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit() {
    onSave({
      firstName:    form.firstName.trim(),
      lastName:     form.lastName.trim(),
      phone:        form.phone.trim(),
      email:        form.email.trim() || null,
      addressLine1: form.addressLine1.trim() || null,
      city:         form.city.trim() || null,
      state:        form.state.trim() || null,
      zip:          form.zip.trim() || null,
      notes:        form.notes.trim() || null,
    });
  }

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="text-2xl font-semibold text-fg-default">
        Edit customer
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First name *">
          <UIInput value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
        </Field>
        <Field label="Last name *">
          <UIInput value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
        </Field>
        <Field label="Phone *">
          <UIInput value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <UIInput value={form.email} onChange={(e) => update('email', e.target.value)} type="email" />
        </Field>
      </div>

      <Field label="Address line 1">
        <UIInput value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City">
          <UIInput value={form.city} onChange={(e) => update('city', e.target.value)} />
        </Field>
        <Field label="State">
          <UIInput
            value={form.state}
            onChange={(e) => update('state', e.target.value.toUpperCase())}
            maxLength={2}
          />
        </Field>
        <Field label="Zip">
          <UIInput value={form.zip} onChange={(e) => update('zip', e.target.value)} maxLength={10} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={4}
          className="w-full bg-bg-surface border border-border-default rounded-[var(--radius-md)] focus-ring placeholder:text-fg-subtle text-fg-default px-3 py-2 text-[13px] resize-none"
        />
      </Field>

      {error && <div className="text-xs text-error-fg">{error}</div>}

      <div className="flex gap-2 pt-2">
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()}
          loading={saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Small UI primitives ───────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card padding="md">
      <div className="text-xs uppercase tracking-wide text-fg-muted">{label}</div>
      <div className={cn('text-lg font-semibold mt-1', accent ? 'text-brand-softfg' : 'text-fg-default')}>
        {value}
      </div>
    </Card>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-3 py-2 text-xs font-medium uppercase tracking-wide text-fg-muted',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td
      className={cn(
        'px-3 py-2 text-sm text-fg-default',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </td>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1 text-fg-muted">{label}</label>
      {children}
    </div>
  );
}
