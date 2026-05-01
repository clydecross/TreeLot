'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';

const SESSION_KEY = 'treelot_driver_session';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Screen =
  | 'select'
  | 'pin'
  | 'route'
  | 'stop'
  | 'menu'
  | 'change-pin'
  | 'history'
  | 'stats';

type DriverSession = { driverId: string; name: string };

type RouteStop = {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  routeOrder: number | null;
  status: string;
  timeWindow: string;
  standIncluded: boolean;
  lightsIncluded: boolean;
  installRequested: boolean;
  specialInstructions: string | null;
  driverNotes: string | null;
  issueReason: string | null;
  deliveredAt: string | Date | null;
  customer: { firstName: string; lastName: string; phone: string };
  purchase: { treeType: string; treeTypeName: string | null; treeSizeRange: string };
};

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'info' | 'warn' | 'error';

const STATUS_VARIANTS: Record<string, { variant: BadgeVariant; label: string }> = {
  unassigned:        { variant: 'neutral', label: 'Unassigned' },
  scheduled:         { variant: 'brand',   label: 'Scheduled' },
  out_for_delivery:  { variant: 'info',    label: 'Out for delivery' },
  delivered:         { variant: 'success', label: 'Delivered' },
  failed:            { variant: 'error',   label: 'Failed' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.unassigned;
  return (
    <Badge variant={s.variant} size="md" className="rounded-full whitespace-nowrap">
      {s.label}
    </Badge>
  );
}

function TimeWindowPill({ window }: { window: string }) {
  return (
    <span className="inline-flex items-center bg-bg-surface text-brand-softfg text-[11px] px-2.5 py-0.5 rounded-full border border-border-default whitespace-nowrap">
      {window}
    </span>
  );
}

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-bg-surface text-brand-softfg text-[11px] px-2.5 py-0.5 rounded-full border border-border-default whitespace-nowrap">
      {children}
    </span>
  );
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  });
}

function formatHistoryDate(iso: string): string {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
    timeZone: 'UTC',
  });
}

function fullAddress(s: { addressLine1: string; city: string; state: string; zip: string }): string {
  return `${s.addressLine1}, ${s.city}, ${s.state} ${s.zip}`;
}

function openMaps(addr: string) {
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const url = isIOS
    ? `http://maps.apple.com/?address=${encodeURIComponent(addr)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  window.open(url, '_blank');
}

// Force dark theme on the entire driver subtree (PWA is meant for outdoor mobile use).
function DriverShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-screen bg-bg-app text-fg-default">
      <div className="max-w-[430px] mx-auto">
        {children}
      </div>
    </div>
  );
}

export default function DriverPage() {
  const params = useParams<{ locationId: string }>();
  const locationId = params?.locationId ?? '';

  if (!UUID_RE.test(locationId)) {
    return (
      <div className="p-8 text-center" style={{ color: '#E8E6E0' }}>
        <div className="text-lg font-semibold mb-2">Invalid lot URL</div>
        <div className="text-sm" style={{ color: '#9b9a94' }}>
          The driver app URL is missing a valid lot identifier. Ask your manager
          for the URL printed for this device.
        </div>
      </div>
    );
  }

  return <DriverApp locationId={locationId} />;
}

function DriverApp({ locationId }: { locationId: string }) {
  const [screen, setScreen] = useState<Screen>('select');
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [session, setSession] = useState<DriverSession | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as DriverSession;
        if (s?.driverId && s?.name) {
          setSession(s);
          setScreen('route');
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  function signOut() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
    setSelectedUser(null);
    setSelectedStopId(null);
    setScreen('select');
  }

  let body: React.ReactNode;

  if (screen === 'select') {
    body = (
      <SelectScreen
        locationId={locationId}
        onPick={(u) => {
          setSelectedUser(u);
          setScreen('pin');
        }}
      />
    );
  } else if (screen === 'pin' && selectedUser) {
    body = (
      <PinScreen
        locationId={locationId}
        user={selectedUser}
        onBack={() => {
          setSelectedUser(null);
          setScreen('select');
        }}
        onSuccess={(s) => {
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          } catch {
            /* ignore */
          }
          setSession(s);
          setScreen('route');
        }}
      />
    );
  } else if (screen === 'route' && session) {
    body = (
      <RouteScreen
        locationId={locationId}
        session={session}
        onMenu={() => setScreen('menu')}
        onPickStop={(id) => {
          setSelectedStopId(id);
          setScreen('stop');
        }}
      />
    );
  } else if (screen === 'stop' && session && selectedStopId) {
    body = (
      <StopScreen
        locationId={locationId}
        session={session}
        stopId={selectedStopId}
        onBack={() => {
          setSelectedStopId(null);
          setScreen('route');
        }}
      />
    );
  } else if (screen === 'menu' && session) {
    body = (
      <MenuScreen
        session={session}
        onBack={() => setScreen('route')}
        onChangePin={() => setScreen('change-pin')}
        onHistory={() => setScreen('history')}
        onStats={() => setScreen('stats')}
        onSignOut={signOut}
      />
    );
  } else if (screen === 'change-pin' && session) {
    body = (
      <ChangePinScreen
        session={session}
        onBack={() => setScreen('menu')}
        onDone={() => setScreen('menu')}
      />
    );
  } else if (screen === 'history' && session) {
    body = <HistoryScreen locationId={locationId} session={session} onBack={() => setScreen('menu')} />;
  } else if (screen === 'stats' && session) {
    body = <StatsScreen locationId={locationId} session={session} onBack={() => setScreen('menu')} />;
  } else {
    body = <SelectScreen locationId={locationId} onPick={(u) => { setSelectedUser(u); setScreen('pin'); }} />;
  }

  return <DriverShell>{body}</DriverShell>;
}

// ─── SELECT SCREEN ──────────────────────────────────────────────────────────
function SelectScreen({ locationId, onPick }: { locationId: string; onPick: (u: { id: string; name: string }) => void }) {
  const drivers = trpc.drivers.getList.useQuery({ locationId });

  return (
    <div className="px-5 py-10">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-fg-default m-0">
          TreeLot Driver
        </h1>
        <p className="text-[14px] text-fg-muted mt-2">
          Tap your name to begin
        </p>
      </div>

      {drivers.isLoading && (
        <div className="text-fg-muted text-[14px]">Loading drivers…</div>
      )}
      {drivers.error && (
        <div className="text-error-fg text-[14px]">
          {drivers.error.message}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(drivers.data ?? []).map((d) => (
          <Button
            key={d.id}
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => onPick({ id: d.id, name: d.name })}
            className="!justify-start !h-auto !py-5 text-[18px]"
          >
            {d.name}
          </Button>
        ))}
        {drivers.data && drivers.data.length === 0 && (
          <div className="text-fg-muted text-[14px]">
            No drivers configured for this location.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── REUSABLE PIN NUMPAD ────────────────────────────────────────────────────
function PinNumpad({
  pin,
  onDigit,
  onBackspace,
  onSubmit,
  disabled,
  shaking,
  error,
  status,
}: {
  pin: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  shaking?: boolean;
  error?: string | null;
  status?: string | null;
}) {
  const keys: Array<{ label: string; on: () => void; kind?: 'digit' | 'back' | 'ok' }> = [
    { label: '1', on: () => onDigit('1') },
    { label: '2', on: () => onDigit('2') },
    { label: '3', on: () => onDigit('3') },
    { label: '4', on: () => onDigit('4') },
    { label: '5', on: () => onDigit('5') },
    { label: '6', on: () => onDigit('6') },
    { label: '7', on: () => onDigit('7') },
    { label: '8', on: () => onDigit('8') },
    { label: '9', on: () => onDigit('9') },
    { label: '←', on: onBackspace, kind: 'back' },
    { label: '0', on: () => onDigit('0') },
    { label: '✓', on: onSubmit, kind: 'ok' },
  ];

  return (
    <>
      <style>{`
        @keyframes tl-shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .tl-shake { animation: tl-shake 0.4s; }
      `}</style>

      <div
        className={cn(
          'flex justify-center gap-4 mb-4',
          shaking && 'tl-shake',
        )}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full',
              i < pin.length
                ? 'bg-brand'
                : 'bg-bg-inset border border-border-default',
            )}
          />
        ))}
      </div>

      <div className="min-h-6 text-center mb-4">
        {error && (
          <span className="text-error-fg text-[13px] font-medium">{error}</span>
        )}
        {!error && status && (
          <span className="text-fg-muted text-[13px]">{status}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-auto">
        {keys.map((k, idx) => {
          const isOk = k.kind === 'ok';
          const isBack = k.kind === 'back';
          const variant: 'primary' | 'ghost' | 'secondary' =
            isOk ? 'primary' : isBack ? 'ghost' : 'secondary';
          return (
            <Button
              key={idx}
              variant={variant}
              size="lg"
              onClick={k.on}
              disabled={disabled && !isBack}
              className={cn(
                '!h-[68px] text-[24px] font-medium',
                (isBack || isOk) && 'text-[22px]',
                isBack && 'border border-border-default',
              )}
            >
              {k.label}
            </Button>
          );
        })}
      </div>
    </>
  );
}

// ─── PIN SCREEN ─────────────────────────────────────────────────────────────
function PinScreen({
  locationId,
  user,
  onBack,
  onSuccess,
}: {
  locationId: string;
  user: { id: string; name: string };
  onBack: () => void;
  onSuccess: (s: DriverSession) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  const auth = trpc.drivers.authenticate.useMutation({
    onSuccess: (data) => {
      onSuccess({ driverId: data.driverId, name: data.name });
    },
    onError: (err) => {
      setError(err.message || 'Incorrect PIN');
      setPin('');
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    },
  });

  function press(d: string) {
    if (pin.length >= 4 || auth.isPending) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      // Auto-submit on 4th digit
      auth.mutate({ userId: user.id, pin: next, locationId });
    }
  }

  function backspace() {
    if (auth.isPending) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  function submit() {
    if (pin.length !== 4 || auth.isPending) return;
    auth.mutate({ userId: user.id, pin, locationId });
  }

  return (
    <div className="px-5 py-6 min-h-screen flex flex-col">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded"
        >
          ← Back
        </button>
      </div>

      <div className="mb-8 text-center">
        <h2 className="text-[24px] font-semibold text-fg-default m-0">
          Hi {user.name}
        </h2>
        <p className="text-[13px] text-fg-muted mt-2">Enter your 4-digit PIN</p>
      </div>

      <PinNumpad
        pin={pin}
        onDigit={press}
        onBackspace={backspace}
        onSubmit={submit}
        disabled={auth.isPending}
        shaking={shaking}
        error={error}
        status={auth.isPending ? 'Checking…' : null}
      />
    </div>
  );
}

// ─── ROUTE SCREEN ───────────────────────────────────────────────────────────
function RouteScreen({
  locationId,
  session,
  onMenu,
  onPickStop,
}: {
  locationId: string;
  session: DriverSession;
  onMenu: () => void;
  onPickStop: (stopId: string) => void;
}) {
  const route = trpc.drivers.getMyRoute.useQuery({
    driverId: session.driverId,
    locationId,
  });
  const startRoute = trpc.drivers.startRoute.useMutation({
    onSuccess: () => route.refetch(),
  });

  const stops = (route.data ?? []) as RouteStop[];
  const hasScheduled = useMemo(() => stops.some((s) => s.status === 'scheduled'), [stops]);

  return (
    <div className="px-4 pt-5 pb-20">
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <div className="text-[20px] font-semibold text-fg-default">{session.name}</div>
          <div className="text-[12px] text-fg-muted mt-1">{formatTodayDate()}</div>
        </div>
        <Button
          variant="secondary"
          size="md"
          aria-label="Menu"
          onClick={onMenu}
          className="!px-3 text-[18px] leading-none"
        >
          ⚙️
        </Button>
      </div>

      <div className="flex items-center gap-3 my-4">
        <Badge variant="neutral" size="md" className="rounded-full">
          {stops.length} stop{stops.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {hasScheduled && (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => startRoute.mutate({ driverId: session.driverId, locationId })}
          loading={startRoute.isPending}
          className="!h-[56px] text-[16px] font-semibold mb-4"
        >
          {startRoute.isPending ? 'Starting…' : 'Start route'}
        </Button>
      )}

      {route.isLoading && (
        <div className="text-fg-muted text-[14px]">Loading route…</div>
      )}
      {route.error && (
        <div className="text-error-fg text-[14px]">{route.error.message}</div>
      )}
      {route.data && stops.length === 0 && (
        <div className="text-fg-muted text-[14px] py-5 text-center">
          No stops assigned for today.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {stops.map((s, i) => {
          const treeName = s.purchase.treeTypeName || s.purchase.treeType;
          return (
            <button
              key={s.id}
              onClick={() => onPickStop(s.id)}
              className="text-left focus-ring rounded-[var(--radius-lg)]"
            >
              <Card padding="md" className="flex flex-col gap-2 hover:bg-bg-elevated transition-colors">
                <div className="flex justify-between items-center gap-2">
                  <span className="inline-flex items-center bg-brand-soft text-brand-softfg text-[12px] font-semibold px-2.5 py-0.5 rounded-md">
                    #{s.routeOrder !== null ? s.routeOrder + 1 : i + 1}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <div className="text-[16px] font-medium text-fg-default">
                  {s.customer.firstName} {s.customer.lastName}
                </div>
                <div className="text-[13px] text-fg-muted">
                  {s.addressLine1}, {s.city}
                </div>
                <div className="text-[12px] text-brand-softfg">
                  {treeName} · {s.purchase.treeSizeRange}
                </div>
                <div>
                  <TimeWindowPill window={s.timeWindow} />
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="mt-5 text-center">
        <Button
          variant="secondary"
          size="md"
          onClick={() => route.refetch()}
          className="text-brand-softfg"
        >
          {route.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

// ─── MENU SCREEN ────────────────────────────────────────────────────────────
function MenuScreen({
  session,
  onBack,
  onChangePin,
  onHistory,
  onStats,
  onSignOut,
}: {
  session: DriverSession;
  onBack: () => void;
  onChangePin: () => void;
  onHistory: () => void;
  onStats: () => void;
  onSignOut: () => void;
}) {
  const items: Array<{ label: string; on: () => void; danger?: boolean }> = [
    { label: 'Change PIN',    on: onChangePin },
    { label: 'Route history', on: onHistory },
    { label: 'Performance',   on: onStats },
    { label: 'Sign out',      on: onSignOut, danger: true },
  ];

  return (
    <div className="px-4 pt-5 pb-20">
      <div className="mb-4">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded"
        >
          ← Back
        </button>
      </div>

      <div className="mb-6">
        <div className="text-[22px] font-semibold text-fg-default">{session.name}</div>
        <div className="text-[12px] text-fg-muted mt-1">Driver</div>
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((it) => (
          <Button
            key={it.label}
            variant={it.danger ? 'danger' : 'secondary'}
            size="lg"
            fullWidth
            onClick={it.on}
            className="!justify-start !h-auto !py-4.5 text-[16px] font-medium"
          >
            {it.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── CHANGE PIN SCREEN ──────────────────────────────────────────────────────
function ChangePinScreen({
  session,
  onBack,
  onDone,
}: {
  session: DriverSession;
  onBack: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState(false);

  const change = trpc.drivers.changePin.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => onDone(), 2000);
    },
    onError: (err) => {
      setError(err.message || 'Current PIN incorrect');
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      // Reset to step 1
      setCurrentPin('');
      setNewPin('');
      setPin('');
      setStep('current');
    },
  });

  function shake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }

  function press(d: string) {
    if (pin.length >= 4 || change.isPending || success) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      // Advance step
      if (step === 'current') {
        setCurrentPin(next);
        setPin('');
        setStep('new');
      } else if (step === 'new') {
        setNewPin(next);
        setPin('');
        setStep('confirm');
      } else {
        // confirm
        if (next !== newPin) {
          setError("PINs don't match");
          shake();
          setNewPin('');
          setPin('');
          setStep('new');
          return;
        }
        change.mutate({
          driverId:   session.driverId,
          currentPin,
          newPin,
        });
      }
    }
  }

  function backspace() {
    if (change.isPending || success) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  function submit() {
    // No-op — auto-submits on 4th digit
  }

  const titleByStep: Record<typeof step, string> = {
    current: 'Enter current PIN',
    new:     'Enter new PIN',
    confirm: 'Confirm new PIN',
  };

  return (
    <div className="px-5 py-6 min-h-screen flex flex-col">
      <div className="mb-4">
        <button
          onClick={onBack}
          disabled={change.isPending || success}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded disabled:opacity-50"
        >
          ← Back
        </button>
      </div>

      <div className="mb-7 text-center">
        <h2 className="text-[22px] font-semibold text-fg-default m-0">
          Change PIN
        </h2>
        <p className="text-[13px] text-fg-muted mt-2">
          {success ? '✓ PIN changed' : titleByStep[step]}
        </p>
      </div>

      {success ? (
        <Card
          padding="md"
          className="bg-success-bg border-[var(--success-border)] text-success-fg text-center text-[16px] font-semibold"
        >
          ✓ PIN changed
        </Card>
      ) : (
        <PinNumpad
          pin={pin}
          onDigit={press}
          onBackspace={backspace}
          onSubmit={submit}
          disabled={change.isPending}
          shaking={shaking}
          error={error}
          status={change.isPending ? 'Saving…' : null}
        />
      )}
    </div>
  );
}

// ─── HISTORY SCREEN ─────────────────────────────────────────────────────────
function HistoryScreen({
  locationId,
  session,
  onBack,
}: {
  locationId: string;
  session: DriverSession;
  onBack: () => void;
}) {
  const history = trpc.drivers.routeHistory.useQuery({
    driverId: session.driverId,
    locationId,
    days:     14,
  });

  const groups = history.data ?? [];

  return (
    <div className="px-4 pt-5 pb-20">
      <div className="mb-4">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded"
        >
          ← Back
        </button>
      </div>

      <div className="mb-4">
        <h2 className="text-[22px] font-semibold text-fg-default m-0">
          Route history
        </h2>
        <p className="text-[12px] text-fg-muted mt-1">Past 14 days</p>
      </div>

      {history.isLoading && (
        <div className="text-fg-muted text-[14px]">Loading…</div>
      )}
      {history.error && (
        <div className="text-error-fg text-[14px]">{history.error.message}</div>
      )}
      {history.data && groups.length === 0 && (
        <Card padding="lg" className="text-center text-fg-muted text-[14px]">
          No deliveries in the past 14 days
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.date}>
            <div className="text-[12px] text-brand-softfg font-semibold uppercase tracking-wide mb-2">
              {formatHistoryDate(g.date)}
            </div>
            <div className="flex flex-col gap-2">
              {g.stops.map((s) => {
                const treeName = s.purchase.treeType;
                return (
                  <Card key={s.id} padding="md" className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[15px] font-medium text-fg-default">
                        {s.customer.firstName} {s.customer.lastName}
                      </span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="text-[13px] text-fg-muted">
                      {s.addressLine1}, {s.city}
                    </div>
                    <div className="text-[12px] text-brand-softfg">
                      {treeName} · {s.purchase.treeSizeRange}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STATS SCREEN ───────────────────────────────────────────────────────────
function StatsScreen({
  locationId,
  session,
  onBack,
}: {
  locationId: string;
  session: DriverSession;
  onBack: () => void;
}) {
  const stats = trpc.drivers.stats.useQuery({
    driverId: session.driverId,
    locationId,
  });

  const cards: Array<{ label: string; value: string; sub?: string }> = stats.data
    ? [
        { label: "Today's stops", value: String(stats.data.todayScheduled) },
        { label: 'This week',     value: String(stats.data.thisWeekDelivered), sub: 'delivered' },
        { label: 'Last 30 days',  value: String(stats.data.totalDelivered),   sub: 'delivered' },
        { label: 'Success rate',  value: `${(stats.data.successRate * 100).toFixed(0)}%` },
      ]
    : [];

  return (
    <div className="px-4 pt-5 pb-20">
      <div className="mb-4">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded"
        >
          ← Back
        </button>
      </div>

      <div className="mb-4">
        <h2 className="text-[22px] font-semibold text-fg-default m-0">
          Performance
        </h2>
        <p className="text-[12px] text-fg-muted mt-1">Your delivery stats</p>
      </div>

      {stats.isLoading && (
        <div className="text-fg-muted text-[14px]">Loading…</div>
      )}
      {stats.error && (
        <div className="text-error-fg text-[14px]">{stats.error.message}</div>
      )}

      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <Card key={c.label} padding="md">
            <div className="text-[12px] text-fg-muted mb-2">
              {c.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-brand-softfg leading-none">
                {c.value}
              </span>
              {c.sub && (
                <span className="text-[13px] text-fg-muted">{c.sub}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── STOP SCREEN ────────────────────────────────────────────────────────────
const ISSUE_REASONS = [
  'Access blocked',
  'Customer not home',
  'Wrong address',
  'Damaged',
  'Other',
];

function StopScreen({
  locationId,
  session,
  stopId,
  onBack,
}: {
  locationId: string;
  session: DriverSession;
  stopId: string;
  onBack: () => void;
}) {
  const route = trpc.drivers.getMyRoute.useQuery({
    driverId: session.driverId,
    locationId,
  });

  const stop = ((route.data ?? []) as RouteStop[]).find((s) => s.id === stopId);

  const markDelivered = trpc.drivers.markDelivered.useMutation({
    onSuccess: async () => {
      await route.refetch();
      onBack();
    },
  });
  const reportIssue = trpc.drivers.reportIssue.useMutation({
    onSuccess: async () => {
      await route.refetch();
      onBack();
    },
  });

  const [showIssue, setShowIssue] = useState(false);
  const [issueReason, setIssueReason] = useState(ISSUE_REASONS[0]);
  const [notes, setNotes] = useState('');

  if (!stop) {
    return (
      <div className="p-5">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 focus-ring rounded"
        >
          ← Back
        </button>
        <div className="mt-6 text-fg-muted">
          {route.isLoading ? 'Loading…' : 'Stop not found.'}
        </div>
      </div>
    );
  }

  const addr = fullAddress(stop);
  const treeName = stop.purchase.treeTypeName || stop.purchase.treeType;
  const indexLabel = stop.routeOrder !== null ? stop.routeOrder + 1 : '?';
  const stopNum = `Stop #${indexLabel}`;

  return (
    <div className="px-4 pt-5 pb-20">
      <button
        onClick={onBack}
        className="bg-transparent border-none text-brand-softfg text-[14px] cursor-pointer p-0 mb-4 focus-ring rounded"
      >
        ← Back
      </button>

      <div className="mb-2">
        <div className="text-[13px] text-brand-softfg font-medium">{stopNum}</div>
        <div className="text-[24px] font-semibold text-fg-default mt-0.5">
          {stop.customer.firstName} {stop.customer.lastName}
        </div>
      </div>

      <div className="my-2 mb-4">
        <StatusBadge status={stop.status} />
      </div>

      {/* Phone */}
      <a
        href={`tel:${stop.customer.phone}`}
        className="block bg-bg-surface border border-border-default p-3.5 rounded-[var(--radius-md)] text-brand-softfg text-[16px] font-medium no-underline mb-2.5 hover:underline underline-offset-2"
      >
        {stop.customer.phone}
      </a>

      {/* Address */}
      <button
        onClick={() => openMaps(addr)}
        className="w-full bg-bg-surface border border-border-default p-3.5 rounded-[var(--radius-md)] text-fg-default text-[14px] text-left cursor-pointer mb-3.5 focus-ring hover:bg-bg-elevated transition-colors"
      >
        <div className="text-brand-softfg text-[11px] mb-1 underline-offset-2">Tap for directions</div>
        <div>{stop.addressLine1}</div>
        <div>{stop.city}, {stop.state} {stop.zip}</div>
      </button>

      {/* Tree details */}
      <Card padding="md" className="mb-3.5">
        <div className="text-[11px] text-fg-muted mb-1.5">Tree</div>
        <div className="text-[16px] text-fg-default font-medium">
          {treeName}
        </div>
        <div className="text-[13px] text-brand-softfg mt-0.5">
          {stop.purchase.treeSizeRange}
        </div>
        <div className="flex gap-1.5 flex-wrap mt-2.5">
          {stop.standIncluded && <FeaturePill>Stand</FeaturePill>}
          {stop.lightsIncluded && <FeaturePill>Lights</FeaturePill>}
          {stop.installRequested && <FeaturePill>Install</FeaturePill>}
        </div>
      </Card>

      {/* Time window */}
      <div className="mb-3.5">
        <div className="text-[11px] text-fg-muted mb-1.5">Time window</div>
        <TimeWindowPill window={stop.timeWindow} />
      </div>

      {/* Special instructions */}
      <Card padding="md" className="mb-4">
        <div className="text-[11px] text-fg-muted mb-1.5">
          Special instructions
        </div>
        {stop.specialInstructions ? (
          <div className="text-[14px] text-fg-default italic">
            {stop.specialInstructions}
          </div>
        ) : (
          <div className="text-[14px] text-fg-muted">—</div>
        )}
      </Card>

      {/* Action area */}
      {stop.status === 'out_for_delivery' && (
        <div className="flex flex-col gap-2.5">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() =>
              markDelivered.mutate({ deliveryId: stop.id, driverId: session.driverId })
            }
            loading={markDelivered.isPending}
            className="!h-[56px] text-[16px] font-semibold"
          >
            {markDelivered.isPending ? 'Marking…' : 'Mark delivered'}
          </Button>

          {!showIssue && (
            <Button
              variant="danger"
              size="lg"
              fullWidth
              onClick={() => setShowIssue(true)}
            >
              Report issue
            </Button>
          )}

          {showIssue && (
            <Card padding="md" className="flex flex-col gap-2.5">
              <div className="text-[13px] text-fg-default font-medium">
                Report an issue
              </div>
              <Select
                value={issueReason}
                onChange={(e) => setIssueReason(e.target.value)}
              >
                {ISSUE_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={3}
                className="w-full rounded-[var(--radius-md)] px-3 py-2 text-[14px] outline-none resize-y bg-bg-app border border-border-default text-fg-default placeholder:text-fg-subtle focus-ring focus:border-border-brand transition-[border-color,box-shadow] duration-[140ms] ease-out font-sans"
              />
              {reportIssue.error && (
                <div className="text-error-fg text-[13px]">
                  {reportIssue.error.message}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setShowIssue(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  loading={reportIssue.isPending}
                  onClick={() =>
                    reportIssue.mutate({
                      deliveryId:  stop.id,
                      driverId:    session.driverId,
                      issueReason,
                      driverNotes: notes || undefined,
                    })
                  }
                >
                  {reportIssue.isPending ? 'Submitting…' : 'Submit'}
                </Button>
              </div>
            </Card>
          )}

          {markDelivered.error && (
            <div className="text-error-fg text-[13px]">
              {markDelivered.error.message}
            </div>
          )}
        </div>
      )}

      {stop.status === 'scheduled' && (
        <Card padding="md" className="text-fg-muted text-[13px] text-center">
          Tap Start Route on the route screen to begin.
        </Card>
      )}

      {stop.status === 'delivered' && (
        <Card
          padding="md"
          className="bg-success-bg border-[var(--success-border)] text-success-fg text-[13px]"
        >
          <div className="font-semibold mb-1">Delivered</div>
          {stop.deliveredAt && (
            <div className="text-brand-softfg text-[12px]">
              {new Date(stop.deliveredAt).toLocaleString()}
            </div>
          )}
          {stop.driverNotes && (
            <div className="text-fg-default text-[13px] mt-1.5 italic">
              {stop.driverNotes}
            </div>
          )}
        </Card>
      )}

      {stop.status === 'failed' && (
        <Card
          padding="md"
          className="bg-error-bg border-[var(--error-border)] text-error-fg text-[13px]"
        >
          <div className="font-semibold mb-1">Issue reported</div>
          {stop.issueReason && <div className="text-fg-default">{stop.issueReason}</div>}
          {stop.driverNotes && (
            <div className="text-fg-default text-[13px] mt-1.5 italic">
              {stop.driverNotes}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
