'use client';

import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/lib/trpc/client';
import type { AppRouter } from '@/server/router';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DeliveryDetailData = NonNullable<RouterOutputs['deliveries']['getById']>;
type DriverUser = RouterOutputs['users']['getByLocation'][number];
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

type StatusFilter = 'all' | 'unassigned' | 'scheduled' | 'out_for_delivery' | 'delivered';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'unassigned',       label: 'Unassigned' },
  { key: 'scheduled',        label: 'Scheduled' },
  { key: 'out_for_delivery', label: 'Out' },
  { key: 'delivered',        label: 'Delivered' },
];

const TIME_WINDOWS = [
  { key: 'morning',   label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening',   label: 'Evening' },
  { key: 'anytime',   label: 'Anytime' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  unassigned:       'Unassigned',
  scheduled:        'Scheduled',
  out_for_delivery: 'Out for delivery',
  delivered:        'Delivered',
  failed:           'Failed',
};

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'info' | 'warn' | 'error';
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  unassigned:       'neutral',
  scheduled:        'brand',
  out_for_delivery: 'info',
  delivered:        'success',
  failed:           'error',
};

const VALID_NEXT: Record<string, string[]> = {
  unassigned:       ['scheduled'],
  scheduled:        ['out_for_delivery', 'unassigned'],
  out_for_delivery: ['delivered', 'failed'],
  delivered:        [],
  failed:           ['scheduled'],
};

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    timeZone: 'UTC',
  });
}

function StatusPill({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'neutral'} size={size} dot>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-1.5">
      {children}
    </div>
  );
}

type MobileTab = 'queue' | 'route';

export default function DeliveriesPage() {
  const utils = trpc.useUtils();

  const [date, setDate]                 = useState<string>(todayIso());
  const [filter, setFilter]             = useState<StatusFilter>('all');
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [selectedDriverId, setDriverId] = useState<string | null>(null);
  const [routeOverride, setRouteOverride] = useState<string[] | null>(null);
  const [mobileTab, setMobileTab]       = useState<MobileTab>('queue');

  const { data: deliveries = [] } = trpc.deliveries.getByDate.useQuery(
    { date },
    { refetchInterval: 30_000 }
  );

  const { data: users = [] } = trpc.users.getByLocation.useQuery();

  const { data: detail } = trpc.deliveries.getById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const invalidate = () => {
    utils.deliveries.getByDate.invalidate();
    utils.deliveries.getById.invalidate();
  };

  const assignDriver = trpc.deliveries.assignDriver.useMutation({ onSuccess: invalidate });
  const updateStatus = trpc.deliveries.updateStatus.useMutation({ onSuccess: invalidate });
  const setRouteOrder = trpc.deliveries.setRouteOrder.useMutation({
    onMutate: (vars) => {
      const prev = routeOverride;
      setRouteOverride(vars.ids);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) setRouteOverride(ctx.prev);
    },
    onSuccess: () => {
      utils.deliveries.getByDate.invalidate();
    },
  });

  useEffect(() => {
    setRouteOverride(null);
  }, [deliveries]);

  const filteredQueue = useMemo(() => {
    if (filter === 'all') return deliveries;
    return deliveries.filter((d) => d.status === filter);
  }, [deliveries, filter]);

  const driverStops = useMemo(() => {
    if (!selectedDriverId) return [];
    const mine = deliveries.filter((d) => d.driverId === selectedDriverId);
    if (!routeOverride) return mine;
    const byId = new Map(mine.map((d) => [d.id, d]));
    const ordered = routeOverride.flatMap((id) => {
      const m = byId.get(id);
      if (!m) return [];
      byId.delete(id);
      return [m];
    });
    return [...ordered, ...byId.values()];
  }, [deliveries, selectedDriverId, routeOverride]);

  const drivers = useMemo(
    () => users.filter((u) => u.role === 'driver' || u.role === 'staff' || u.role === 'manager'),
    [users]
  );

  function onDragEnd(result: DropResult) {
    if (!result.destination || !selectedDriverId) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;

    const next = [...driverStops];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setRouteOrder.mutate({ ids: next.map((d) => d.id) });
  }

  function assignSelectedToDriver() {
    if (!selectedId || !selectedDriverId) return;
    assignDriver.mutate({ deliveryId: selectedId, driverId: selectedDriverId });
  }

  const queueCount = filteredQueue.length;
  const selectedDriver = drivers.find((u) => u.id === selectedDriverId) ?? null;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-bg-app">

      {/* ════════════════════════════════════════════════════════════════
          MOBILE — Top tab bar (Queue / Route)
      ════════════════════════════════════════════════════════════════ */}
      <nav
        className="lg:hidden flex border-b border-border-default bg-bg-surface flex-shrink-0"
        aria-label="Deliveries sections"
      >
        {(
          [
            { key: 'queue', label: 'Queue',  meta: queueCount > 0 ? String(queueCount) : null },
            { key: 'route', label: 'Route',  meta: selectedDriver?.name ?? null },
          ] as const
        ).map((tab) => {
          const active = mobileTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMobileTab(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 py-3 text-center text-[13px] font-medium focus-ring transition-colors',
                active
                  ? 'text-brand-softfg border-b-2 border-b-brand'
                  : 'text-fg-muted border-b-2 border-b-transparent',
              )}
            >
              <span>{tab.label}</span>
              {tab.meta && (
                <span className="ml-1.5 text-[11px] text-fg-muted tabular-nums">
                  {tab.meta}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ════════════════════════════════════════════════════════════════
          LEFT — Delivery queue
      ════════════════════════════════════════════════════════════════ */}
      <aside
        className={cn(
          'flex-col lg:flex-shrink-0 flex-1 lg:flex-none lg:w-[280px] w-full lg:border-r lg:border-border-default bg-bg-surface overflow-hidden min-h-0',
          'lg:flex',
          mobileTab === 'queue' ? 'flex' : 'hidden lg:flex',
        )}
      >
        <div className="p-3 border-b border-border-default flex flex-col gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setSelectedId(null); }}
            inputSize="sm"
          />
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? 'primary' : 'secondary'}
                onClick={() => setFilter(f.key)}
                className="lg:flex-none flex-1"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredQueue.length === 0 && (
            <div className="flex items-center justify-center h-32 text-xs text-center px-4 text-fg-subtle">
              No deliveries
            </div>
          )}
          {TIME_WINDOWS.map((tw) => {
            const items = filteredQueue.filter((d) => d.timeWindow === tw.key);
            if (items.length === 0) return null;
            return (
              <div key={tw.key}>
                <div className="px-3 py-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase text-fg-muted bg-bg-inset">
                  {tw.label} <span className="opacity-60">· {items.length}</span>
                </div>
                {items.map((d) => {
                  const isSelected = d.id === selectedId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b border-border-subtle transition-colors duration-[140ms] ease-out focus-ring',
                        isSelected
                          ? 'bg-brand-soft border-l-2 border-l-brand pl-[10px]'
                          : 'hover:bg-bg-elevated',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className={cn('text-[13px] font-semibold truncate',
                          isSelected ? 'text-brand-softfg' : 'text-fg-default')}>
                          {d.customer.firstName} {d.customer.lastName}
                        </span>
                        <StatusPill status={d.status} />
                      </div>
                      <div className="text-[11.5px] text-fg-muted truncate">
                        {d.addressLine1}, {d.city}
                      </div>
                      <div className="text-[11px] mt-0.5 truncate text-brand-softfg">
                        {d.purchase.treeTypeName ?? d.purchase.treeType} · {d.purchase.treeSizeRange}
                        {d.purchase.standIncluded ? ' · stand' : ''}
                        {d.purchase.lightsIncluded ? ' · lights' : ''}
                      </div>
                      {d.driver && (
                        <div className="text-[11px] mt-0.5 truncate text-fg-muted">
                          → {d.driver.name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════════
          CENTER — Route board
      ════════════════════════════════════════════════════════════════ */}
      <section
        className={cn(
          'flex-1 flex-col overflow-hidden lg:border-r lg:border-border-default w-full',
          'lg:flex',
          mobileTab === 'route' ? 'flex' : 'hidden lg:flex',
        )}
      >
        <div className="p-4 border-b border-border-default flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-bg-surface">
          <div>
            <div className="text-[16px] font-semibold tracking-tight text-fg-default">
              {fmtDateLong(date)}
            </div>
            <div className="text-[12px] mt-0.5 text-fg-muted">
              {deliveries.length} stop{deliveries.length === 1 ? '' : 's'} total
              {selectedDriverId ? ` · ${driverStops.length} on this route` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[200px]">
              <Select
                selectSize="sm"
                value={selectedDriverId ?? ''}
                onChange={(e) => setDriverId(e.target.value || null)}
              >
                <option value="">Select driver…</option>
                {drivers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={assignSelectedToDriver}
              disabled={!selectedId || !selectedDriverId}
              loading={assignDriver.isPending}
            >
              Assign selected
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-bg-app">
          {!selectedDriverId ? (
            <div className="flex items-center justify-center h-full text-sm text-fg-muted">
              Select a driver to plan their route
            </div>
          ) : driverStops.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-center text-fg-muted">
              No stops assigned yet.<br />
              Click a delivery on the left, then “Assign selected”.
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="route">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-col gap-2"
                  >
                    {driverStops.map((d, i) => (
                      <Draggable key={d.id} draggableId={d.id} index={i}>
                        {(p, snap) => (
                          <div
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            onClick={() => setSelectedId(d.id)}
                            className={cn(
                              'rounded-[var(--radius-lg)] p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing min-h-[64px]',
                              'bg-bg-surface border transition-[box-shadow,border-color,background-color] duration-[140ms] ease-out',
                              snap.isDragging
                                ? 'shadow-[var(--shadow-lg)] border-border-brand'
                                : d.id === selectedId
                                  ? 'border-l-2 border-l-brand bg-brand-soft'
                                  : 'border-border-default hover:border-border-strong shadow-[var(--shadow-sm)]',
                            )}
                            style={p.draggableProps.style}
                          >
                            <Badge variant="brand" size="sm">#{i + 1}</Badge>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="text-[13px] font-semibold truncate text-fg-default">
                                  {d.customer.firstName} {d.customer.lastName}
                                </span>
                                <StatusPill status={d.status} />
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11.5px] truncate text-fg-muted">
                                  {d.addressLine1}, {d.city}
                                </span>
                                <Badge variant="neutral" size="sm">
                                  {TIME_WINDOWS.find(t => t.key === d.timeWindow)?.label}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5 text-fg-subtle flex-shrink-0">
                              <span className="block w-3 h-px bg-current" />
                              <span className="block w-3 h-px bg-current" />
                              <span className="block w-3 h-px bg-current" />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          RIGHT — Delivery detail (desktop aside; mobile bottom sheet)
      ════════════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col flex-shrink-0 w-[280px] overflow-y-auto bg-bg-surface">
        {!selectedId || !detail ? (
          <div className="flex items-center justify-center h-full text-xs text-center px-6 text-fg-subtle">
            {selectedId ? 'Loading…' : 'Select a delivery to view details'}
          </div>
        ) : (
          <DeliveryDetail
            detail={detail}
            drivers={drivers}
            assignDriver={assignDriver}
            updateStatus={updateStatus}
          />
        )}
      </aside>

      {/* Mobile bottom sheet for selected delivery */}
      {selectedId && (
        <>
          <button
            type="button"
            aria-label="Close delivery detail"
            onClick={() => setSelectedId(null)}
            className="lg:hidden fixed inset-0 bg-bg-overlay z-30"
          />
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-surface border-t border-border-default rounded-t-[var(--radius-xl)] flex flex-col overflow-hidden"
            style={{ maxHeight: '80vh' }}
            role="dialog"
            aria-label="Delivery detail"
          >
            <div className="w-10 h-1 bg-border-strong rounded-full mx-auto mt-2 flex-shrink-0" />
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center rounded-md text-fg-muted hover:text-fg-default hover:bg-bg-elevated focus-ring"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex-1 overflow-y-auto">
              {!detail ? (
                <div className="flex items-center justify-center h-32 text-xs text-fg-subtle">
                  Loading…
                </div>
              ) : (
                <DeliveryDetail
                  detail={detail}
                  drivers={drivers}
                  assignDriver={assignDriver}
                  updateStatus={updateStatus}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type DeliveryDetailProps = {
  detail: DeliveryDetailData;
  drivers: DriverUser[];
  assignDriver: ReturnType<typeof trpc.deliveries.assignDriver.useMutation>;
  updateStatus: ReturnType<typeof trpc.deliveries.updateStatus.useMutation>;
};

function DeliveryDetail({ detail, drivers, assignDriver, updateStatus }: DeliveryDetailProps) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <SectionLabel>Customer</SectionLabel>
        <div className="text-[15px] font-semibold tracking-tight text-fg-default">
          {detail.customer.firstName} {detail.customer.lastName}
        </div>
        <div className="text-[13px] mt-0.5 text-brand-softfg tabular-nums">
          {detail.customer.phone}
        </div>
      </div>

      <div>
        <SectionLabel>Tree</SectionLabel>
        <div className="text-[13px] font-medium text-fg-default">
          {detail.purchase.treeTypeName ?? detail.purchase.treeType}
        </div>
        <div className="text-[11.5px] mt-0.5 text-fg-muted">
          {detail.purchase.treeSizeRange}
          {detail.standIncluded ? ' · stand' : ''}
          {detail.lightsIncluded ? ' · lights' : ''}
          {detail.installRequested ? ' · install' : ''}
        </div>
      </div>

      <div>
        <SectionLabel>Address</SectionLabel>
        <div className="text-[13px] text-fg-default">
          {detail.addressLine1}
        </div>
        <div className="text-[13px] text-fg-default">
          {detail.city}, {detail.state} {detail.zip}
        </div>
      </div>

      <div>
        <SectionLabel>Date &amp; window</SectionLabel>
        <div className="text-[13px] text-fg-default">
          {fmtDateLong(typeof detail.deliveryDate === 'string'
            ? detail.deliveryDate.slice(0, 10)
            : new Date(detail.deliveryDate).toISOString().slice(0, 10))}
        </div>
        <div className="text-[11.5px] mt-0.5 capitalize text-fg-muted">
          {detail.timeWindow}
        </div>
      </div>

      <div>
        <SectionLabel>Status</SectionLabel>
        <Select
          selectSize="sm"
          value={detail.status}
          onChange={(e) => updateStatus.mutate({ deliveryId: detail.id, status: e.target.value as 'unassigned' | 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed' })}
        >
          <option value={detail.status}>{STATUS_LABEL[detail.status]}</option>
          {VALID_NEXT[detail.status].map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </Select>
        {updateStatus.isError && (
          <div className="text-[11px] mt-1 text-error-fg">
            {updateStatus.error.message}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Driver</SectionLabel>
        <Select
          selectSize="sm"
          value={detail.driverId ?? ''}
          onChange={(e) =>
            assignDriver.mutate({
              deliveryId: detail.id,
              driverId:   e.target.value || null,
            })
          }
        >
          <option value="">Unassigned</option>
          {drivers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </div>

      {detail.specialInstructions && (
        <div>
          <SectionLabel>Special instructions</SectionLabel>
          <Card variant="inset" padding="sm" radius="md">
            <div className="text-[12px] leading-relaxed text-fg-default">
              {detail.specialInstructions}
            </div>
            {detail.purchase.createdBy && (
              <div className="text-[11px] text-fg-muted mt-1.5">
                Added by {detail.purchase.createdBy.name}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
