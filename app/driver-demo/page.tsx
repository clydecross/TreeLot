'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';

// ── Types ────────────────────────────────────────────────────────────────────

type StopStatus = 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed';

type Stop = {
  id:             string;
  order:          number;
  status:         StopStatus;
  customer:       { name: string; phone: string };
  address:        string;
  city:           string;
  state:          string;
  zip:            string;
  tree:           string;
  size:           string;
  stand:          boolean;
  lights:         boolean;
  install:        boolean;
  window:         string;
  instructions:   string | null;
  distanceToNext: string | null;
  etaToNext:      string | null;
  deliveredAt:    string | null;
  issueReason:    string | null;
  driverNotes:    string | null;
};

type NavScreen =
  | { name: 'select' }
  | { name: 'briefing' }
  | { name: 'en_route';   stopId: string }
  | { name: 'at_stop';    stopId: string }
  | { name: 'checklist';  stopId: string }
  | { name: 'confirming'; stopId: string }
  | { name: 'success';    stopId: string }
  | { name: 'issue';      stopId: string }
  | { name: 'complete' };

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_STOPS: Stop[] = [
  {
    id: '1', order: 1, status: 'scheduled',
    customer: { name: 'Patricia Moore', phone: '(214) 555-0182' },
    address: '4521 Beverly Dr', city: 'Highland Park', state: 'TX', zip: '75205',
    tree: 'Fraser Fir', size: "7–8'",
    stand: true, lights: true, install: false,
    window: '10 am – 12 pm',
    instructions: 'Side gate on the left. Code is 4521. Leave tree on the covered back porch.',
    distanceToNext: '3.8 mi', etaToNext: '~9 min',
    deliveredAt: null, issueReason: null, driverNotes: null,
  },
  {
    id: '2', order: 2, status: 'scheduled',
    customer: { name: 'Mike & Dana Chen', phone: '(214) 555-0374' },
    address: '6814 Lakewood Blvd', city: 'Dallas', state: 'TX', zip: '75214',
    tree: 'Douglas Fir', size: "6–7'",
    stand: true, lights: false, install: false,
    window: '12 pm – 2 pm',
    instructions: null,
    distanceToNext: '2.1 mi', etaToNext: '~6 min',
    deliveredAt: null, issueReason: null, driverNotes: null,
  },
  {
    id: '3', order: 3, status: 'scheduled',
    customer: { name: 'The Williams Family', phone: '(214) 555-0591' },
    address: '3906 Armstrong Pkwy', city: 'Highland Park', state: 'TX', zip: '75205',
    tree: 'Fraser Fir', size: "8–9'",
    stand: true, lights: true, install: true,
    window: '12 pm – 4 pm',
    instructions: 'Large dog in the backyard — use the front door only. Ring the bell twice.',
    distanceToNext: '4.2 mi', etaToNext: '~11 min',
    deliveredAt: null, issueReason: null, driverNotes: null,
  },
  {
    id: '4', order: 4, status: 'scheduled',
    customer: { name: 'Robert & Mary Patel', phone: '(214) 555-0248' },
    address: '2200 Swiss Ave', city: 'Dallas', state: 'TX', zip: '75204',
    tree: 'Canaan Fir', size: "5–6'",
    stand: false, lights: false, install: false,
    window: '3 pm – 5 pm',
    instructions: null,
    distanceToNext: '5.6 mi', etaToNext: '~14 min',
    deliveredAt: null, issueReason: null, driverNotes: null,
  },
  {
    id: '5', order: 5, status: 'scheduled',
    customer: { name: 'Thompson Residence', phone: '(972) 555-0763' },
    address: '9401 Midway Rd', city: 'Dallas', state: 'TX', zip: '75220',
    tree: 'Noble Fir', size: "9–10'",
    stand: true, lights: false, install: true,
    window: '4 pm – 6 pm',
    instructions: 'Call on arrival. Ask for Karen.',
    distanceToNext: null, etaToNext: null,
    deliveredAt: null, issueReason: null, driverNotes: null,
  },
];

const ISSUE_REASONS = [
  'Access blocked',
  'Customer not home',
  'Wrong address',
  'Damaged tree',
  'Other',
];

// ── Utilities ────────────────────────────────────────────────────────────────

function openMaps(addr: string) {
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const url   = isIOS
    ? `http://maps.apple.com/?address=${encodeURIComponent(addr)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  window.open(url, '_blank');
}

function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Shared components ────────────────────────────────────────────────────────

const STATUS_CFG: Record<StopStatus, { bg: string; text: string; label: string }> = {
  out_for_delivery: { bg: 'bg-[#E3EEF8]', text: 'text-[#1B5A8C]', label: 'Out for delivery' },
  scheduled:        { bg: 'bg-[#EDEAF8]', text: 'text-[#4B3FA0]', label: 'Scheduled'        },
  delivered:        { bg: 'bg-[#E6F2DF]', text: 'text-[#1E4D10]', label: 'Delivered'         },
  failed:           { bg: 'bg-[#FEF2F2]', text: 'text-[#B91C1C]', label: 'Issue reported'    },
};

function StatusBadge({ status }: { status: StopStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold whitespace-nowrap', c.bg, c.text)}>
      {c.label}
    </span>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center bg-[#E6F2DF] text-[#1E4D10] text-[13px] font-medium px-3 py-1 rounded-full">
      {label}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl shadow-sm border border-[#E8E4DB] p-4', className)}>
      {children}
    </div>
  );
}

function ProgressStrip({ stops, onViewRoute }: { stops: Stop[]; onViewRoute: () => void }) {
  const delivered = stops.filter(s => s.status === 'delivered').length;
  const current   = stops.find(s => s.status === 'out_for_delivery');
  const stopNum   = current?.order ?? (delivered + 1);
  const pct       = (delivered / stops.length) * 100;
  return (
    <div className="bg-white border-b border-[#D8D3C8] sticky top-0 z-10">
      <div className="max-w-[430px] mx-auto px-3 pt-2.5 pb-2 flex items-center gap-2">
        <button
          onClick={onViewRoute}
          className="flex items-center gap-1 text-[#2B6318] text-[13px] font-semibold whitespace-nowrap flex-shrink-0 h-[32px] px-2 rounded-lg hover:bg-[#E6F2DF] transition-colors"
        >
          ← Route
        </button>
        <div className="flex-1 flex justify-between items-center">
          <span className="text-[13px] font-semibold text-[#706D65]">Stop {stopNum} of {stops.length}</span>
          <span className="text-[13px] font-semibold text-[#2B6318]">{delivered} delivered</span>
        </div>
      </div>
      <div className="h-[3px] bg-[#EDE9E0]">
        <div className="h-[3px] bg-[#2B6318] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PrimaryBtn({
  children, onClick, disabled, className,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full h-[64px] rounded-xl bg-[#2B6318] text-white text-[18px] font-semibold transition-all',
        'hover:bg-[#236014] active:scale-[0.98]',
        'disabled:bg-[#D8D3C8] disabled:text-[#9B9890] disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children, onClick, className,
}: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full h-[56px] rounded-xl bg-white border border-[#D8D3C8] text-[#2B6318] text-[16px] font-semibold',
        'hover:bg-[#F7F4EE] active:scale-[0.98] transition-all',
        className,
      )}
    >
      {children}
    </button>
  );
}

function DangerBtn({
  children, onClick, className,
}: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full h-[56px] rounded-xl bg-white border border-[#FECACA] text-[#B91C1C] text-[16px] font-semibold',
        'hover:bg-[#FEF2F2] active:scale-[0.98] transition-all',
        className,
      )}
    >
      {children}
    </button>
  );
}

function BackBtn({ label = '← Back', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[#2B6318] text-[16px] font-semibold py-1">
      {label}
    </button>
  );
}

function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#F7F4EE]/95 backdrop-blur border-t border-[#D8D3C8] px-4 py-4">
      <div className="max-w-[430px] mx-auto flex flex-col gap-2">
        {children}
      </div>
    </div>
  );
}

// ── Hold-to-confirm button ────────────────────────────────────────────────────

function HoldButton({ onConfirm }: { onConfirm: () => void }) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef     = useRef(false);

  function startHold() {
    if (doneRef.current) return;
    let p = 0;
    intervalRef.current = setInterval(() => {
      p += 100 / 30; // 30 ticks × 50 ms = 1.5 s
      if (p >= 100) {
        clearInterval(intervalRef.current!);
        doneRef.current = true;
        setProgress(100);
        setTimeout(onConfirm, 250);
      } else {
        setProgress(p);
      }
    }, 50);
  }

  function cancelHold() {
    if (doneRef.current) return;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setProgress(0);
  }

  const isDone    = progress >= 100;
  const isActive  = progress > 0 && !isDone;
  const labelText = isDone ? '✓ Confirmed' : isActive ? 'Keep holding…' : 'Hold to confirm delivery';

  return (
    <button
      className="relative w-full h-[64px] rounded-xl overflow-hidden select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B6318]"
      style={{ background: '#EDE9E0' }}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
    >
      {/* Fill bar */}
      <div
        className="absolute inset-0 transition-colors duration-200"
        style={{
          width:      `${progress}%`,
          background: isDone ? '#1E4D10' : '#2B6318',
        }}
      />
      <span className={cn('relative z-10 text-[18px] font-semibold', progress > 0 ? 'text-white' : 'text-[#2B6318]')}>
        {labelText}
      </span>
    </button>
  );
}

// ── Menu drawer ───────────────────────────────────────────────────────────────

function MenuDrawer({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  return (
    <>
      <button className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-label="Close menu" />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl">
        <div className="max-w-[430px] mx-auto">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[#D8D3C8]" />
          </div>
          <div className="px-5 py-4 border-b border-[#EDE9E0]">
            <div className="text-[22px] font-bold text-[#1A1A16]">Jake M.</div>
            <div className="text-[13px] text-[#706D65] uppercase tracking-widest mt-0.5">Driver</div>
          </div>
          <div className="px-5 py-2 flex flex-col">
            {(['Route history', 'Performance', 'Change PIN'] as const).map(label => (
              <button
                key={label}
                onClick={onClose}
                className="flex justify-between items-center w-full h-[64px] text-[18px] font-medium text-[#1A1A16] border-b border-[#EDE9E0] last:border-0 text-left"
              >
                {label}
                <span className="text-[#D8D3C8] text-[22px] leading-none">›</span>
              </button>
            ))}
            <button
              onClick={onReset}
              className="flex justify-between items-center w-full h-[64px] text-[18px] font-semibold text-[#B91C1C] text-left"
            >
              Reset demo
              <span className="text-[#FECACA] text-[22px] leading-none">›</span>
            </button>
          </div>
          <div className="px-5 pb-8 text-[12px] text-[#9B9890]">
            Patton's Christmas Tree Farm · TreeLot Driver v1.0
          </div>
        </div>
      </div>
    </>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function DriverDemoPage() {
  const [stops,       setStops]  = useState<Stop[]>(DEMO_STOPS.map(s => ({ ...s })));
  // Stack-based navigation — each forward move pushes, back pops.
  const [stack,       setStack]  = useState<NavScreen[]>([{ name: 'select' }]);
  const [menuOpen,    setMenu]   = useState(false);
  const [note,        setNote]   = useState('');

  const screen = stack[stack.length - 1]!;

  // ── History API wiring ───────────────────────────────────────────────────
  // Push a dummy entry per navigation so the phone's back button fires
  // popstate instead of leaving the page entirely.

  function push(to: NavScreen) {
    setStack(prev => [...prev, to]);
    window.history.pushState({ tl: to.name }, '');
  }

  // After irreversible actions (delivered, issue) replace the forward stack
  // so back goes to the route overview, not the confirm screen.
  function pushAfterAction(to: NavScreen) {
    setStack([{ name: 'briefing' }, to]);
    window.history.pushState({ tl: to.name }, '');
  }

  function goBack() {
    setStack(prev => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }

  // Seed an initial history entry on mount so the first popstate works.
  useEffect(() => {
    window.history.replaceState({ tl: 'select' }, '');
    window.addEventListener('popstate', goBack);
    return () => window.removeEventListener('popstate', goBack);
  }, []); // goBack uses functional setState — safe with empty deps

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getStop(id: string) { return stops.find(s => s.id === id)!; }

  function nextUp(afterId?: string) {
    return stops.find(s =>
      s.status !== 'delivered' && s.status !== 'failed' && s.id !== afterId,
    ) ?? null;
  }

  function patch(id: string, update: Partial<Stop>) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function startRoute() {
    const first = stops[0]!;
    patch(first.id, { status: 'out_for_delivery' });
    push({ name: 'en_route', stopId: first.id });
  }

  function headToNext(fromId: string) {
    const next = nextUp(fromId);
    if (!next) {
      push({ name: 'complete' });
    } else {
      patch(next.id, { status: 'out_for_delivery' });
      push({ name: 'en_route', stopId: next.id });
    }
  }

  function confirmDelivery(id: string) {
    patch(id, { status: 'delivered', deliveredAt: nowTime(), driverNotes: note || null });
    setNote('');
    pushAfterAction({ name: 'success', stopId: id });
  }

  function reportIssue(id: string, reason: string, notes: string) {
    patch(id, { status: 'failed', issueReason: reason, driverNotes: notes || null });
    pushAfterAction({ name: 'success', stopId: id });
  }

  function resetDemo() {
    setStops(DEMO_STOPS.map(s => ({ ...s })));
    setStack([{ name: 'select' }]);
    setMenu(false);
    setNote('');
    window.history.replaceState({ tl: 'select' }, '');
  }

  const viewRoute = () => {
    setStack([{ name: 'briefing' }]);
    window.history.replaceState({ tl: 'briefing' }, '');
  };

  // ── Screen dispatch ───────────────────────────────────────────────────────

  let body: React.ReactNode;
  const s = screen;

  if (s.name === 'select') {
    body = <SelectScreen onSelect={() => push({ name: 'briefing' })} />;

  } else if (s.name === 'briefing') {
    body = (
      <BriefingScreen
        stops={stops}
        onStart={startRoute}
        onMenu={() => setMenu(true)}
      />
    );

  } else if (s.name === 'en_route') {
    body = (
      <EnRouteScreen
        stop={getStop(s.stopId)}
        stops={stops}
        onArrive={() => push({ name: 'at_stop', stopId: s.stopId })}
        onViewRoute={viewRoute}
        onMenu={() => setMenu(true)}
      />
    );

  } else if (s.name === 'at_stop') {
    body = (
      <AtStopScreen
        stop={getStop(s.stopId)}
        stops={stops}
        onChecklist={() => push({ name: 'checklist', stopId: s.stopId })}
        onIssue={() => push({ name: 'issue', stopId: s.stopId })}
        onViewRoute={viewRoute}
        onMenu={() => setMenu(true)}
      />
    );

  } else if (s.name === 'checklist') {
    body = (
      <ChecklistScreen
        stop={getStop(s.stopId)}
        stops={stops}
        onConfirm={() => { setNote(''); push({ name: 'confirming', stopId: s.stopId }); }}
        onBack={goBack}
        onViewRoute={viewRoute}
      />
    );

  } else if (s.name === 'confirming') {
    body = (
      <ConfirmScreen
        stop={getStop(s.stopId)}
        note={note}
        onNoteChange={setNote}
        onConfirmed={() => confirmDelivery(s.stopId)}
        onIssue={() => push({ name: 'issue', stopId: s.stopId })}
        onBack={goBack}
      />
    );

  } else if (s.name === 'success') {
    const stop = getStop(s.stopId);
    body = (
      <SuccessScreen
        stop={stop}
        stops={stops}
        nextStop={nextUp(s.stopId)}
        onNext={() => headToNext(s.stopId)}
        onViewRoute={viewRoute}
      />
    );

  } else if (s.name === 'issue') {
    body = (
      <IssueScreen
        stop={getStop(s.stopId)}
        stops={stops}
        onSubmit={(reason, notes) => reportIssue(s.stopId, reason, notes)}
        onBack={goBack}
        onViewRoute={viewRoute}
      />
    );

  } else if (s.name === 'complete') {
    body = <CompleteScreen stops={stops} onReset={resetDemo} />;
  }

  return (
    <div className="min-h-[100dvh] bg-[#F7F4EE]">
      <div className="max-w-[430px] mx-auto">{body}</div>
      {menuOpen && <MenuDrawer onClose={() => setMenu(false)} onReset={resetDemo} />}
    </div>
  );
}

// ── Screen: Select ────────────────────────────────────────────────────────────

function SelectScreen({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="px-5 pt-14 pb-12">
      <div className="text-[12px] font-semibold text-[#706D65] uppercase tracking-widest mb-3">
        Patton's Christmas Tree Farm · Dec 15
      </div>
      <h1 className="text-[30px] font-bold text-[#1A1A16] leading-tight mb-2">
        Who's driving today?
      </h1>
      <p className="text-[16px] text-[#706D65] mb-8">Tap your name to get started.</p>

      <div className="bg-[#FFFBEB] border border-[#F3D8A0] rounded-2xl px-4 py-3.5 mb-8 flex items-start gap-3">
        <span className="text-[20px] mt-0.5">⚡</span>
        <p className="text-[14px] text-[#92400E] leading-relaxed">
          <strong>Demo mode</strong> — PIN entry is skipped. In production, each driver enters a private 4-digit PIN.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onSelect}
          className="w-full h-[72px] bg-white rounded-2xl border-2 border-[#D8D3C8] shadow-sm flex items-center justify-between px-5 text-[20px] font-bold text-[#1A1A16] hover:border-[#2B6318] hover:bg-[#E6F2DF] transition-all active:scale-[0.98]"
        >
          Jake M.
          <span className="text-[#2B6318] text-[24px]">›</span>
        </button>
        <button
          disabled
          className="w-full h-[72px] bg-white rounded-2xl border border-[#EDE9E0] flex items-center justify-between px-5 text-[20px] font-bold text-[#B0ABA3] cursor-not-allowed"
        >
          Tom R.
          <span className="text-[13px] font-normal text-[#B0ABA3]">Not scheduled</span>
        </button>
      </div>

      <p className="mt-10 text-center text-[14px] text-[#9B9890]">
        Not listed? Ask your manager to add you.
      </p>
    </div>
  );
}

// ── Screen: Briefing ──────────────────────────────────────────────────────────

function BriefingScreen({
  stops, onStart, onMenu,
}: { stops: Stop[]; onStart: () => void; onMenu: () => void }) {
  const totalMi = stops.reduce((sum, s) => sum + parseFloat(s.distanceToNext ?? '0'), 0);

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="bg-white border-b border-[#D8D3C8] px-5 pt-12 pb-5">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[12px] font-semibold text-[#706D65] uppercase tracking-widest mb-1">Mon, Dec 15</div>
            <div className="text-[28px] font-bold text-[#1A1A16]">Jake M.</div>
            <div className="text-[15px] text-[#706D65] mt-0.5">Highland Park &amp; Dallas route</div>
          </div>
          <button
            onClick={onMenu}
            className="w-[48px] h-[48px] flex items-center justify-center rounded-xl bg-[#F7F4EE] border border-[#D8D3C8] text-[22px]"
          >
            ☰
          </button>
        </div>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {/* Stats */}
        <Card>
          <div className="grid grid-cols-3 divide-x divide-[#EDE9E0] text-center">
            {[
              { val: String(stops.length),           sub: 'Stops'    },
              { val: `~${Math.round(totalMi)} mi`,   sub: 'Distance' },
              { val: '10am–6pm',                     sub: 'Window'   },
            ].map(({ val, sub }) => (
              <div key={sub} className="py-1">
                <div className="text-[22px] font-bold text-[#1A1A16] leading-8">{val}</div>
                <div className="text-[11px] font-semibold text-[#706D65] uppercase tracking-wide mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Weather */}
        <div className="bg-[#FFFBEB] border border-[#F3D8A0] rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-[22px]">🌤</span>
          <span className="text-[#92400E] text-[15px] font-medium">42°F · clear skies · light wind. Dress warm.</span>
        </div>

        {/* Stop list */}
        <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-widest px-1 mt-1">Today's route</div>
        {stops.map(s => (
          <Card key={s.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-[#E6F2DF] text-[#1E4D10] text-[14px] font-bold flex-shrink-0">
                  {s.order}
                </span>
                <div>
                  <div className="text-[17px] font-bold text-[#1A1A16] leading-tight">{s.customer.name}</div>
                  <div className="text-[13px] text-[#706D65]">{s.address}, {s.city}</div>
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center bg-[#F0EDE6] text-[#706D65] text-[12px] font-medium px-2.5 py-1 rounded-full">
                🕐 {s.window}
              </span>
              {s.distanceToNext && (
                <span className="text-[12px] text-[#9B9890]">{s.distanceToNext} to next</span>
              )}
            </div>
            {(s.stand || s.lights || s.install) && (
              <div className="flex gap-1.5 flex-wrap">
                {s.stand   && <Chip label="Stand" />}
                {s.lights  && <Chip label="Lights" />}
                {s.install && <Chip label="Install" />}
              </div>
            )}
          </Card>
        ))}
      </div>

      <StickyFooter>
        <PrimaryBtn onClick={onStart}>Start route →</PrimaryBtn>
      </StickyFooter>
    </div>
  );
}

// ── Screen: En Route ──────────────────────────────────────────────────────────

function EnRouteScreen({
  stop, stops, onArrive, onViewRoute, onMenu,
}: { stop: Stop; stops: Stop[]; onArrive: () => void; onViewRoute: () => void; onMenu: () => void }) {
  const addr = `${stop.address}, ${stop.city}, ${stop.state} ${stop.zip}`;

  return (
    <div className="pb-36">
      <ProgressStrip stops={stops} onViewRoute={onViewRoute} />

      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[13px] font-semibold text-[#706D65] uppercase tracking-wide">En route</span>
        <button
          onClick={onMenu}
          className="w-[48px] h-[48px] flex items-center justify-center rounded-xl bg-white border border-[#D8D3C8] text-[20px]"
        >
          ⚙
        </button>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {/* Hero */}
        <Card className="!p-5">
          <div className="text-[13px] font-bold text-[#706D65] uppercase tracking-widest mb-1.5">
            Next stop · #{stop.order}
          </div>
          <div className="text-[30px] font-bold text-[#1A1A16] leading-tight mb-1">
            {stop.customer.name}
          </div>
          <div className="text-[16px] text-[#4A4740] mb-4">
            {stop.address}, {stop.city}
          </div>
          {(stop.distanceToNext && stop.etaToNext) && (
            <div className="inline-flex items-center gap-2 bg-[#E6F2DF] text-[#1E4D10] text-[15px] font-semibold px-3.5 py-2 rounded-full mb-5">
              <span>📍</span>
              <span>{stop.distanceToNext} · {stop.etaToNext}</span>
            </div>
          )}
          <PrimaryBtn onClick={() => openMaps(addr)} className="!h-[60px]">
            Navigate →
          </PrimaryBtn>
        </Card>

        {/* Window */}
        <Card className="flex items-center gap-3 !py-4">
          <span className="text-[26px]">🕐</span>
          <div>
            <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide">Delivery window</div>
            <div className="text-[18px] font-bold text-[#1A1A16] mt-0.5">{stop.window}</div>
          </div>
        </Card>

        {/* Special instructions — always visible if present */}
        {stop.instructions && (
          <div className="bg-[#FFFBEB] border border-[#F3D8A0] border-l-4 border-l-[#F59E0B] rounded-2xl px-4 py-4">
            <div className="text-[12px] font-bold text-[#92400E] uppercase tracking-wide mb-1.5">
              ⚠ Special instructions
            </div>
            <div className="text-[16px] text-[#1A1A16] italic leading-relaxed">
              "{stop.instructions}"
            </div>
          </div>
        )}
      </div>

      <StickyFooter>
        <PrimaryBtn onClick={onArrive}>I've arrived</PrimaryBtn>
        <button onClick={() => openMaps(addr)} className="text-[#2B6318] text-[15px] font-semibold py-1">
          Open in Maps again →
        </button>
      </StickyFooter>
    </div>
  );
}

// ── Screen: At Stop ───────────────────────────────────────────────────────────

function AtStopScreen({
  stop, stops, onChecklist, onIssue, onViewRoute, onMenu,
}: { stop: Stop; stops: Stop[]; onChecklist: () => void; onIssue: () => void; onViewRoute: () => void; onMenu: () => void }) {
  const addr = `${stop.address}, ${stop.city}, ${stop.state} ${stop.zip}`;

  return (
    <div className="pb-36">
      <ProgressStrip stops={stops} onViewRoute={onViewRoute} />

      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <span className="inline-flex items-center bg-[#E6F2DF] text-[#1E4D10] text-[13px] font-bold px-3 py-1 rounded-lg">
          Stop #{stop.order}
        </span>
        <button
          onClick={onMenu}
          className="w-[48px] h-[48px] flex items-center justify-center rounded-xl bg-white border border-[#D8D3C8] text-[20px]"
        >
          ⚙
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="text-[30px] font-bold text-[#1A1A16] leading-tight mt-1">{stop.customer.name}</div>
        <div className="mt-2"><StatusBadge status={stop.status} /></div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 mt-1">
        {/* Phone */}
        <a
          href={`tel:${stop.customer.phone}`}
          className="flex items-center gap-4 bg-white rounded-2xl border border-[#D8D3C8] shadow-sm h-[76px] px-4 no-underline hover:bg-[#F7F4EE] transition-colors active:scale-[0.98]"
        >
          <span className="text-[26px]">📞</span>
          <div>
            <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide">Call customer</div>
            <div className="text-[19px] font-bold text-[#2B6318]">{stop.customer.phone}</div>
          </div>
        </a>

        {/* Address */}
        <button
          onClick={() => openMaps(addr)}
          className="flex items-center gap-4 bg-white rounded-2xl border border-[#D8D3C8] shadow-sm h-[76px] px-4 w-full text-left hover:bg-[#F7F4EE] transition-colors active:scale-[0.98]"
        >
          <span className="text-[26px]">📍</span>
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-[#2B6318] uppercase tracking-wide">Tap for directions</div>
            <div className="text-[16px] font-bold text-[#1A1A16] truncate">{stop.address}</div>
            <div className="text-[13px] text-[#706D65]">{stop.city}, {stop.state} {stop.zip}</div>
          </div>
        </button>

        {/* Tree */}
        <Card>
          <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide mb-1.5">Tree</div>
          <div className="text-[20px] font-bold text-[#1A1A16]">{stop.tree}</div>
          <div className="text-[16px] font-semibold text-[#2B6318] mt-0.5">{stop.size}</div>
          {(stop.stand || stop.lights || stop.install) && (
            <div className="flex gap-2 flex-wrap mt-3">
              {stop.stand   && <Chip label="Stand" />}
              {stop.lights  && <Chip label="Lights" />}
              {stop.install && <Chip label="Install" />}
            </div>
          )}
        </Card>

        {/* Window + distance */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="!py-3.5">
            <div className="text-[11px] font-bold text-[#706D65] uppercase tracking-wide mb-1">Window</div>
            <div className="text-[15px] font-bold text-[#1A1A16]">🕐 {stop.window}</div>
          </Card>
          {stop.distanceToNext ? (
            <Card className="!py-3.5">
              <div className="text-[11px] font-bold text-[#706D65] uppercase tracking-wide mb-1">Next stop</div>
              <div className="text-[15px] font-bold text-[#4A4740]">{stop.distanceToNext} away</div>
            </Card>
          ) : (
            <Card className="!py-3.5">
              <div className="text-[11px] font-bold text-[#706D65] uppercase tracking-wide mb-1">Next stop</div>
              <div className="text-[15px] font-bold text-[#4A4740]">Last stop</div>
            </Card>
          )}
        </div>

        {/* Special instructions */}
        {stop.instructions ? (
          <div className="bg-[#FFFBEB] border border-[#F3D8A0] border-l-[5px] border-l-[#F59E0B] rounded-2xl px-4 py-4">
            <div className="text-[12px] font-bold text-[#92400E] uppercase tracking-wide mb-2">
              ⚠ Special instructions
            </div>
            <div className="text-[16px] text-[#1A1A16] italic leading-relaxed">
              "{stop.instructions}"
            </div>
          </div>
        ) : (
          <Card>
            <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide mb-1">Special instructions</div>
            <div className="text-[15px] text-[#9B9890]">None for this stop</div>
          </Card>
        )}
      </div>

      <StickyFooter>
        <PrimaryBtn onClick={onChecklist}>Start delivery checklist →</PrimaryBtn>
        <DangerBtn onClick={onIssue}>Report issue</DangerBtn>
      </StickyFooter>
    </div>
  );
}

// ── Screen: Checklist ─────────────────────────────────────────────────────────

function ChecklistScreen({
  stop, stops, onConfirm, onBack, onViewRoute,
}: { stop: Stop; stops: Stop[]; onConfirm: () => void; onBack: () => void; onViewRoute: () => void }) {
  const items = [
    { id: 'tree',    label: stop.tree,     sub: `${stop.size} — main item`,            show: true       },
    { id: 'stand',   label: 'Tree stand',  sub: 'Attach to base before leaving',        show: stop.stand   },
    { id: 'lights',  label: 'Lights kit',  sub: 'Hand to customer at the door',         show: stop.lights  },
    { id: 'install', label: 'Set up tree', sub: 'Help customer place and set up tree',  show: stop.install },
  ].filter(i => i.show);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allDone = checked.size === items.length;

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="pb-36">
      <ProgressStrip stops={stops} onViewRoute={onViewRoute} />

      <div className="px-4 pt-5 pb-3">
        <BackBtn onClick={onBack} />
        <h2 className="text-[26px] font-bold text-[#1A1A16] mt-3 mb-1">Confirm drop-off</h2>
        <p className="text-[15px] text-[#706D65]">Check off everything you're leaving with the customer.</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {items.map(item => {
          const done = checked.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={cn(
                'flex items-center gap-4 w-full rounded-2xl border-2 p-4 h-[80px] text-left transition-all active:scale-[0.98]',
                done ? 'bg-[#E6F2DF] border-[#2B6318]' : 'bg-white border-[#D8D3C8]',
              )}
            >
              <div className={cn(
                'w-[36px] h-[36px] rounded-xl border-2 flex-shrink-0 flex items-center justify-center transition-all',
                done ? 'bg-[#2B6318] border-[#2B6318]' : 'bg-white border-[#D8D3C8]',
              )}>
                {done && <span className="text-white text-[18px] font-bold">✓</span>}
              </div>
              <div>
                <div className={cn('text-[18px] font-bold transition-all', done ? 'text-[#1E4D10] line-through decoration-[#2B6318]/60' : 'text-[#1A1A16]')}>
                  {item.label}
                </div>
                <div className={cn('text-[13px] mt-0.5', done ? 'text-[#4A8A4A]' : 'text-[#706D65]')}>
                  {item.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <StickyFooter>
        <PrimaryBtn onClick={onConfirm} disabled={!allDone}>
          {allDone ? 'Confirm delivery →' : `Check everything off (${checked.size} / ${items.length})`}
        </PrimaryBtn>
        <button onClick={onConfirm} className="text-[#9B9890] text-[14px] font-medium py-1 text-center">
          Skip checklist
        </button>
      </StickyFooter>
    </div>
  );
}

// ── Screen: Confirming ────────────────────────────────────────────────────────

function ConfirmScreen({
  stop, note, onNoteChange, onConfirmed, onIssue, onBack,
}: {
  stop: Stop; note: string; onNoteChange: (v: string) => void;
  onConfirmed: () => void; onIssue: () => void; onBack: () => void;
}) {
  return (
    <div className="px-4 pt-6 pb-10 min-h-[100dvh] flex flex-col">
      <BackBtn onClick={onBack} />

      <div className="mt-6 mb-6">
        <h2 className="text-[26px] font-bold text-[#1A1A16]">Confirm delivery</h2>
        <p className="text-[15px] text-[#706D65] mt-1 leading-relaxed">
          Hold the button for 1.5 seconds to confirm. The customer will be notified.
        </p>
      </div>

      {/* Summary */}
      <Card className="mb-4">
        <div className="text-[18px] font-bold text-[#1A1A16]">{stop.customer.name}</div>
        <div className="text-[14px] text-[#706D65] mt-0.5">{stop.address}, {stop.city}</div>
        <div className="text-[14px] font-semibold text-[#2B6318] mt-1">{stop.tree} · {stop.size}</div>
      </Card>

      {/* Note */}
      <Card className="mb-6 flex-shrink-0">
        <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide mb-2">
          Add a note (optional)
        </div>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="e.g. Left on porch, rang twice"
          rows={3}
          className="w-full text-[16px] text-[#1A1A16] placeholder:text-[#B0ABA3] bg-transparent focus:outline-none resize-none"
        />
      </Card>

      <HoldButton onConfirm={onConfirmed} />

      <button
        onClick={onIssue}
        className="mt-5 text-[#B91C1C] text-[16px] font-semibold py-2"
      >
        Something went wrong?
      </button>
    </div>
  );
}

// ── Screen: Success ───────────────────────────────────────────────────────────

function SuccessScreen({
  stop, stops, nextStop, onNext, onViewRoute,
}: { stop: Stop; stops: Stop[]; nextStop: Stop | null; onNext: () => void; onViewRoute: () => void }) {
  const delivered = stops.filter(s => s.status === 'delivered').length;
  const isIssue   = stop.status === 'failed';

  return (
    <div className="px-4 pt-16 pb-10 min-h-[100dvh] flex flex-col items-center">
      <div className={cn(
        'w-[88px] h-[88px] rounded-full flex items-center justify-center text-[40px] mb-5 shadow-sm',
        isIssue ? 'bg-[#FEF2F2]' : 'bg-[#E6F2DF]',
      )}>
        {isIssue ? '⚠️' : '✓'}
      </div>

      <h2 className="text-[30px] font-bold text-[#1A1A16] text-center">
        {isIssue ? 'Issue reported' : 'Delivered!'}
      </h2>
      {stop.deliveredAt && !isIssue && (
        <div className="text-[16px] text-[#706D65] mt-1">Marked at {stop.deliveredAt}</div>
      )}
      {isIssue && stop.issueReason && (
        <div className="text-[15px] text-[#B91C1C] font-semibold mt-1">{stop.issueReason}</div>
      )}

      <div className="w-full mt-8">
        <Card>
          <div className="flex justify-between items-center mb-3">
            <span className="text-[17px] font-bold text-[#1A1A16]">
              {delivered} of {stops.length} complete
            </span>
            <span className="text-[15px] font-bold text-[#2B6318]">
              {Math.round((delivered / stops.length) * 100)}%
            </span>
          </div>
          <div className="h-2.5 bg-[#EDE9E0] rounded-full overflow-hidden">
            <div
              className="h-2.5 bg-[#2B6318] rounded-full transition-all duration-700"
              style={{ width: `${(delivered / stops.length) * 100}%` }}
            />
          </div>
          <div className="text-[13px] text-[#706D65] mt-2">
            {isIssue ? 'Great effort — moving on.' : `Nice work, Jake.`}
          </div>
        </Card>
      </div>

      {nextStop && (
        <div className="w-full mt-3">
          <Card>
            <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-widest mb-2">Next up</div>
            <div className="text-[18px] font-bold text-[#1A1A16]">{nextStop.customer.name}</div>
            <div className="text-[13px] text-[#706D65] mt-0.5">{nextStop.address}, {nextStop.city}</div>
            {stop.distanceToNext && (
              <div className="inline-flex items-center gap-1.5 bg-[#E6F2DF] text-[#1E4D10] text-[13px] font-semibold px-3 py-1 rounded-full mt-2.5">
                📍 {stop.distanceToNext} away
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="w-full mt-6 flex flex-col gap-2">
        {nextStop ? (
          <>
            <PrimaryBtn onClick={onNext}>Navigate to next stop →</PrimaryBtn>
            <GhostBtn onClick={onViewRoute}>View full route</GhostBtn>
          </>
        ) : (
          <PrimaryBtn onClick={onNext}>View today's summary →</PrimaryBtn>
        )}
      </div>
    </div>
  );
}

// ── Screen: Issue ─────────────────────────────────────────────────────────────

function IssueScreen({
  stop, stops, onSubmit, onBack, onViewRoute,
}: { stop: Stop; stops: Stop[]; onSubmit: (reason: string, notes: string) => void; onBack: () => void; onViewRoute: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notes,    setNotes]    = useState('');

  return (
    <div className="pb-36">
      <ProgressStrip stops={stops} onViewRoute={onViewRoute} />

      <div className="px-4 pt-5 pb-3">
        <BackBtn onClick={onBack} />
        <h2 className="text-[26px] font-bold text-[#1A1A16] mt-3 mb-1">What happened?</h2>
        <p className="text-[15px] text-[#706D65]">Your manager will be notified automatically.</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {ISSUE_REASONS.map(r => (
          <button
            key={r}
            onClick={() => setSelected(r)}
            className={cn(
              'flex justify-between items-center w-full h-[68px] rounded-2xl border-2 px-4 text-[18px] font-semibold text-left transition-all active:scale-[0.98]',
              selected === r
                ? 'bg-[#FEF2F2] border-[#B91C1C] text-[#B91C1C]'
                : 'bg-white border-[#D8D3C8] text-[#1A1A16] hover:border-[#FECACA] hover:bg-[#FEF2F2]',
            )}
          >
            {r}
            {selected === r && <span className="text-[#B91C1C] text-[22px]">✓</span>}
          </button>
        ))}

        <Card className="mt-1">
          <div className="text-[12px] font-bold text-[#706D65] uppercase tracking-wide mb-2">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. gate was padlocked, no response after 3 knocks"
            rows={3}
            className="w-full text-[16px] text-[#1A1A16] placeholder:text-[#B0ABA3] bg-transparent focus:outline-none resize-none"
          />
        </Card>
      </div>

      <StickyFooter>
        <button
          onClick={() => selected && onSubmit(selected, notes)}
          disabled={!selected}
          className={cn(
            'w-full h-[64px] rounded-xl text-white text-[18px] font-bold transition-all',
            selected ? 'bg-[#B91C1C] hover:bg-[#991B1B] active:scale-[0.98]' : 'bg-[#D8D3C8] text-[#9B9890] cursor-not-allowed',
          )}
        >
          {selected ? 'Report issue →' : 'Select a reason first'}
        </button>
      </StickyFooter>
    </div>
  );
}

// ── Screen: Complete ──────────────────────────────────────────────────────────

function CompleteScreen({ stops, onReset }: { stops: Stop[]; onReset: () => void }) {
  const delivered = stops.filter(s => s.status === 'delivered').length;
  const failed    = stops.filter(s => s.status === 'failed').length;

  return (
    <div className="px-4 pt-16 pb-12 min-h-[100dvh] flex flex-col items-center">
      <div className="text-[64px] mb-4">🎄</div>
      <h1 className="text-[30px] font-bold text-[#1A1A16] text-center">Route complete!</h1>
      <p className="text-[17px] text-[#706D65] mt-2 text-center">Great work today, Jake.</p>

      <div className="w-full mt-8">
        <Card className="!p-5">
          <div className="text-[15px] font-bold text-[#706D65] uppercase tracking-widest mb-4">Today's summary</div>
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-[56px] border-b border-[#EDE9E0]">
              <span className="text-[17px] text-[#4A4740]">Delivered</span>
              <span className="text-[20px] font-bold text-[#2B6318]">{delivered} of {stops.length}</span>
            </div>
            {failed > 0 && (
              <div className="flex justify-between items-center h-[56px] border-b border-[#EDE9E0]">
                <span className="text-[17px] text-[#4A4740]">Issues</span>
                <span className="text-[20px] font-bold text-[#B91C1C]">{failed}</span>
              </div>
            )}
            <div className="flex justify-between items-center h-[56px]">
              <span className="text-[17px] text-[#4A4740]">Route</span>
              <span className="text-[16px] font-semibold text-[#4A4740]">Highland Park &amp; Dallas</span>
            </div>
          </div>
        </Card>
      </div>

      {failed > 0 && (
        <div className="w-full mt-3">
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-4">
            <div className="text-[12px] font-bold text-[#B91C1C] uppercase tracking-wide mb-2">Issues to resolve</div>
            {stops.filter(s => s.status === 'failed').map(s => (
              <div key={s.id} className="text-[15px] font-semibold text-[#1A1A16]">
                {s.customer.name.split(' ')[0]} — {s.issueReason}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[13px] text-[#9B9890] mt-6 text-center leading-relaxed">
        A delivery report has been sent to your manager.
      </p>

      <div className="w-full mt-8 flex flex-col gap-2">
        <PrimaryBtn onClick={onReset}>End shift</PrimaryBtn>
        <p className="text-[12px] text-[#9B9890] text-center">This will sign you out of this device</p>
      </div>
    </div>
  );
}
