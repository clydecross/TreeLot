'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

// ── Demo data ────────────────────────────────────────────────────────────────

type StopStatus = 'out_for_delivery' | 'scheduled' | 'delivered' | 'failed';

type Stop = {
  id:                  string;
  routeOrder:          number;
  status:              StopStatus;
  customer:            { name: string; phone: string };
  address:             string;
  city:                string;
  state:               string;
  zip:                 string;
  treeType:            string;
  treeSize:            string;
  stand:               boolean;
  lights:              boolean;
  install:             boolean;
  timeWindow:          string;
  specialInstructions: string | null;
  distanceToNext:      string | null;
  deliveredAt:         string | null;
  issueReason:         string | null;
  driverNotes:         string | null;
};

const INITIAL_STOPS: Stop[] = [
  {
    id:                  '1',
    routeOrder:          0,
    status:              'delivered',
    customer:            { name: 'Patricia Moore', phone: '(615) 555-0182' },
    address:             '2847 Belmont Blvd',
    city:                'Nashville',
    state:               'TN',
    zip:                 '37212',
    treeType:            'Fraser Fir',
    treeSize:            "7–8'",
    stand:               true,
    lights:              true,
    install:             false,
    timeWindow:          '10 am – 12 pm',
    specialInstructions: 'Back gate, code is 2847. Leave tree on covered porch.',
    distanceToNext:      '1.2 mi',
    deliveredAt:         '10:47 AM',
    issueReason:         null,
    driverNotes:         null,
  },
  {
    id:                  '2',
    routeOrder:          1,
    status:              'out_for_delivery',
    customer:            { name: 'Mike & Dana Chen', phone: '(615) 555-0374' },
    address:             '1435 Chickering Rd',
    city:                'Nashville',
    state:               'TN',
    zip:                 '37215',
    treeType:            'Douglas Fir',
    treeSize:            "6–7'",
    stand:               true,
    lights:              false,
    install:             false,
    timeWindow:          '12 pm – 2 pm',
    specialInstructions: null,
    distanceToNext:      '2.8 mi',
    deliveredAt:         null,
    issueReason:         null,
    driverNotes:         null,
  },
  {
    id:                  '3',
    routeOrder:          2,
    status:              'out_for_delivery',
    customer:            { name: 'The Williams Family', phone: '(615) 555-0591' },
    address:             '4521 Harding Pike',
    city:                'Nashville',
    state:               'TN',
    zip:                 '37205',
    treeType:            'Fraser Fir',
    treeSize:            "8–9'",
    stand:               true,
    lights:              true,
    install:             true,
    timeWindow:          '12 pm – 4 pm',
    specialInstructions: 'Dog in backyard, please use front door. Ring doorbell twice.',
    distanceToNext:      '1.6 mi',
    deliveredAt:         null,
    issueReason:         null,
    driverNotes:         null,
  },
  {
    id:                  '4',
    routeOrder:          3,
    status:              'scheduled',
    customer:            { name: 'Robert & Mary Patel', phone: '(615) 555-0248' },
    address:             '3301 West End Ave',
    city:                'Nashville',
    state:               'TN',
    zip:                 '37203',
    treeType:            'Canaan Fir',
    treeSize:            "5–6'",
    stand:               false,
    lights:              false,
    install:             false,
    timeWindow:          '3 pm – 5 pm',
    specialInstructions: null,
    distanceToNext:      '4.2 mi',
    deliveredAt:         null,
    issueReason:         null,
    driverNotes:         null,
  },
  {
    id:                  '5',
    routeOrder:          4,
    status:              'scheduled',
    customer:            { name: 'Thompson Residence', phone: '(615) 555-0763' },
    address:             '5510 Oak Hill Rd',
    city:                'Brentwood',
    state:               'TN',
    zip:                 '37027',
    treeType:            'Noble Fir',
    treeSize:            "9–10'",
    stand:               true,
    lights:              false,
    install:             true,
    timeWindow:          '4 pm – 6 pm',
    specialInstructions: 'Call on arrival. Ask for Karen.',
    distanceToNext:      null,
    deliveredAt:         null,
    issueReason:         null,
    driverNotes:         null,
  },
];

const ISSUE_REASONS = [
  'Access blocked',
  'Customer not home',
  'Wrong address',
  'Damaged',
  'Other',
];

// ── Styles / helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StopStatus, { label: string; bg: string; fg: string }> = {
  out_for_delivery: { label: 'Out for delivery', bg: 'bg-[#1a2e3a]', fg: 'text-[#6ab8d4]' },
  scheduled:        { label: 'Scheduled',        bg: 'bg-[#1a1a2e]', fg: 'text-[#8b8bd4]' },
  delivered:        { label: 'Delivered',         bg: 'bg-[#1a2e1a]', fg: 'text-[#6db86d]' },
  failed:           { label: 'Issue reported',    bg: 'bg-[#2e1a1a]', fg: 'text-[#d46b6b]' },
};

function StatusBadge({ status }: { status: StopStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', c.bg, c.fg)}>
      {c.label}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-[#1f2a1a] text-[#6db86d] text-[11px] px-2.5 py-0.5 rounded-full border border-[#2e3e2a] whitespace-nowrap">
      {children}
    </span>
  );
}

function openMaps(addr: string) {
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const url = isIOS
    ? `http://maps.apple.com/?address=${encodeURIComponent(addr)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  window.open(url, '_blank');
}

// ── Screen types ─────────────────────────────────────────────────────────────

type Screen = 'route' | 'stop';

// ── Root ─────────────────────────────────────────────────────────────────────

export default function DriverDemoPage() {
  const [stops, setStops]         = useState<Stop[]>(INITIAL_STOPS);
  const [screen, setScreen]       = useState<Screen>('route');
  const [activeStop, setActive]   = useState<string | null>(null);

  function pickStop(id: string) {
    setActive(id);
    setScreen('stop');
  }

  function markDelivered(id: string) {
    const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setStops(prev =>
      prev.map(s =>
        s.id === id ? { ...s, status: 'delivered', deliveredAt: now } : s,
      ),
    );
    setScreen('route');
    setActive(null);
  }

  function reportIssue(id: string, reason: string, notes: string) {
    setStops(prev =>
      prev.map(s =>
        s.id === id ? { ...s, status: 'failed', issueReason: reason, driverNotes: notes || null } : s,
      ),
    );
    setScreen('route');
    setActive(null);
  }

  const stop = stops.find(s => s.id === activeStop) ?? null;

  return (
    <div data-theme="dark" className="min-h-[100dvh] bg-[#141412] text-[#e8e6e0]">
      <div className="max-w-[430px] mx-auto">
        {screen === 'route' && (
          <RouteScreen stops={stops} onPickStop={pickStop} />
        )}
        {screen === 'stop' && stop && (
          <StopScreen
            stop={stop}
            onBack={() => { setScreen('route'); setActive(null); }}
            onDelivered={markDelivered}
            onIssue={reportIssue}
          />
        )}
      </div>
    </div>
  );
}

// ── Route screen ─────────────────────────────────────────────────────────────

function RouteScreen({ stops, onPickStop }: { stops: Stop[]; onPickStop: (id: string) => void }) {
  const delivered = stops.filter(s => s.status === 'delivered').length;
  const remaining = stops.filter(s => s.status === 'out_for_delivery' || s.status === 'scheduled').length;
  const failed    = stops.filter(s => s.status === 'failed').length;

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-[22px] font-semibold text-[#e8e6e0]">Jake M.</div>
          <div className="text-[12px] text-[#6b6960] mt-0.5">Mon, Dec 15 · Nashville & Brentwood</div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold text-[#6db86d]">{delivered}</div>
          <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">delivered</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[#2a2927] rounded-full h-1.5 mb-4">
        <div
          className="bg-[#4a9e4a] h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${stops.length === 0 ? 0 : (delivered / stops.length) * 100}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex gap-2 mb-5">
        <span className="inline-flex items-center bg-[#1a1a17] border border-[#2e2e2a] rounded-full px-3 py-0.5 text-[12px] text-[#a8a49e]">
          {remaining} remaining
        </span>
        {failed > 0 && (
          <span className="inline-flex items-center bg-[#2e1a1a] border border-[#3e2a2a] rounded-full px-3 py-0.5 text-[12px] text-[#d46b6b]">
            {failed} issue{failed !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Demo banner */}
      <div className="bg-[#2a2000] border border-[#4a3a00] rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
        <span className="text-[#d4aa00] text-[11px]">⚡</span>
        <span className="text-[#d4aa00] text-[12px]">Demo mode — interactions update local state only</span>
      </div>

      {/* Stop list */}
      <div className="flex flex-col gap-2.5">
        {stops.map((s, i) => {
          const statusCfg = STATUS_CONFIG[s.status];
          const isDone    = s.status === 'delivered' || s.status === 'failed';
          return (
            <button
              key={s.id}
              onClick={() => onPickStop(s.id)}
              className={cn(
                'text-left w-full rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a9e4a]',
                isDone
                  ? 'bg-[#111110] border-[#1e1e1c] opacity-60'
                  : 'bg-[#1a1a17] border-[#2e2e2a] hover:bg-[#1f1f1c] active:bg-[#252522]',
              )}
            >
              <div className="p-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="inline-flex items-center bg-[#1f2a1a] text-[#6db86d] text-[12px] font-semibold px-2 py-0.5 rounded-md">
                    #{i + 1}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <div className={cn('text-[16px] font-medium mb-0.5', isDone ? 'text-[#6b6960]' : 'text-[#e8e6e0]')}>
                  {s.customer.name}
                </div>
                <div className="text-[13px] text-[#6b6960]">{s.address}, {s.city}</div>
                <div className="text-[12px] text-[#4a7c59] mt-1">{s.treeType} · {s.treeSize}</div>

                <div className="flex items-center justify-between mt-2.5">
                  <span className="inline-flex items-center bg-[#0f1a0f] text-[#4a7c59] text-[11px] px-2.5 py-0.5 rounded-full border border-[#1e2e1e]">
                    {s.timeWindow}
                  </span>
                  {s.distanceToNext && !isDone && (
                    <span className="text-[11px] text-[#4a4940]">
                      {s.distanceToNext} to next →
                    </span>
                  )}
                  {s.status === 'delivered' && s.deliveredAt && (
                    <span className="text-[11px] text-[#4a7c59]">✓ {s.deliveredAt}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Stop screen ──────────────────────────────────────────────────────────────

function StopScreen({
  stop,
  onBack,
  onDelivered,
  onIssue,
}: {
  stop:        Stop;
  onBack:      () => void;
  onDelivered: (id: string) => void;
  onIssue:     (id: string, reason: string, notes: string) => void;
}) {
  const [showIssue,    setShowIssue]    = useState(false);
  const [issueReason,  setIssueReason]  = useState(ISSUE_REASONS[0]!);
  const [notes,        setNotes]        = useState('');
  const [confirming,   setConfirming]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);

  const addr = `${stop.address}, ${stop.city}, ${stop.state} ${stop.zip}`;

  function handleDelivered() {
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      setSubmitting(true);
      setTimeout(() => {
        onDelivered(stop.id);
      }, 600);
    }, 200);
  }

  function handleIssue() {
    setSubmitting(true);
    setTimeout(() => {
      onIssue(stop.id, issueReason, notes);
    }, 600);
  }

  return (
    <div className="px-4 pt-5 pb-24">
      <button
        onClick={onBack}
        className="bg-transparent border-none text-[#4a7c59] text-[14px] cursor-pointer p-0 mb-4"
      >
        ← Back to route
      </button>

      {/* Header */}
      <div className="mb-2">
        <div className="text-[12px] text-[#4a7c59] font-medium">Stop #{stop.routeOrder + 1}</div>
        <div className="text-[26px] font-semibold text-[#e8e6e0] mt-0.5 leading-tight">
          {stop.customer.name}
        </div>
      </div>

      <div className="mb-4">
        <StatusBadge status={stop.status} />
      </div>

      {/* Phone */}
      <a
        href={`tel:${stop.customer.phone}`}
        className="flex items-center gap-3 bg-[#1a1a17] border border-[#2e2e2a] p-3.5 rounded-xl text-[#4a9e4a] text-[16px] font-medium no-underline mb-2.5 hover:bg-[#1f1f1c] transition-colors"
      >
        <span className="text-[18px]">📞</span>
        {stop.customer.phone}
      </a>

      {/* Address / directions */}
      <button
        onClick={() => openMaps(addr)}
        className="w-full bg-[#1a1a17] border border-[#2e2e2a] p-3.5 rounded-xl text-[#e8e6e0] text-[14px] text-left mb-3.5 hover:bg-[#1f1f1c] transition-colors"
      >
        <div className="text-[#4a7c59] text-[11px] mb-1.5 flex items-center gap-1">
          <span>📍</span>
          <span>Tap for directions</span>
        </div>
        <div className="font-medium">{stop.address}</div>
        <div className="text-[#9b9a94]">{stop.city}, {stop.state} {stop.zip}</div>
      </button>

      {/* Tree card */}
      <div className="bg-[#1a1a17] border border-[#2e2e2a] rounded-xl p-4 mb-3.5">
        <div className="text-[11px] text-[#6b6960] mb-1.5 uppercase tracking-wide">Tree</div>
        <div className="text-[17px] font-semibold text-[#e8e6e0]">{stop.treeType}</div>
        <div className="text-[13px] text-[#4a7c59] mt-0.5">{stop.treeSize}</div>
        {(stop.stand || stop.lights || stop.install) && (
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {stop.stand   && <Pill>Stand</Pill>}
            {stop.lights  && <Pill>Lights</Pill>}
            {stop.install && <Pill>Install</Pill>}
          </div>
        )}
      </div>

      {/* Time window */}
      <div className="mb-3.5">
        <div className="text-[11px] text-[#6b6960] mb-1.5 uppercase tracking-wide">Delivery window</div>
        <span className="inline-flex items-center bg-[#0f1a0f] text-[#4a7c59] text-[12px] px-3 py-1 rounded-full border border-[#1e2e1e]">
          🕐 {stop.timeWindow}
        </span>
      </div>

      {/* Distance to next */}
      {stop.distanceToNext && stop.status !== 'delivered' && (
        <div className="mb-3.5">
          <div className="text-[11px] text-[#6b6960] mb-1.5 uppercase tracking-wide">Next stop</div>
          <div className="text-[14px] text-[#9b9a94]">
            <span className="text-[#e8e6e0] font-medium">{stop.distanceToNext}</span> to next delivery
          </div>
        </div>
      )}

      {/* Special instructions */}
      <div className="bg-[#1a1a17] border border-[#2e2e2a] rounded-xl p-4 mb-5">
        <div className="text-[11px] text-[#6b6960] mb-1.5 uppercase tracking-wide">Special instructions</div>
        {stop.specialInstructions ? (
          <div className="text-[14px] text-[#e8e6e0] italic leading-relaxed">
            &ldquo;{stop.specialInstructions}&rdquo;
          </div>
        ) : (
          <div className="text-[14px] text-[#4a4940]">None</div>
        )}
      </div>

      {/* Actions */}
      {stop.status === 'out_for_delivery' && !submitting && (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleDelivered}
            disabled={confirming}
            className={cn(
              'w-full h-[60px] rounded-xl text-[17px] font-semibold transition-all duration-150',
              confirming
                ? 'bg-[#2a7a2a] text-[#6db86d] scale-[0.98]'
                : 'bg-[#27500A] text-[#a8d870] hover:bg-[#2e5e0e] active:scale-[0.98]',
            )}
          >
            {confirming ? 'Saving…' : '✓ Mark delivered'}
          </button>

          {!showIssue && (
            <button
              onClick={() => setShowIssue(true)}
              className="w-full h-[48px] rounded-xl text-[15px] font-medium bg-transparent border border-[#3e2a2a] text-[#d46b6b] hover:bg-[#2e1a1a] transition-colors"
            >
              Report issue
            </button>
          )}

          {showIssue && (
            <div className="bg-[#1a1a17] border border-[#3e2a2a] rounded-xl p-4 flex flex-col gap-3">
              <div className="text-[14px] font-medium text-[#e8e6e0]">Report an issue</div>
              <select
                value={issueReason}
                onChange={e => setIssueReason(e.target.value)}
                className="w-full bg-[#111110] border border-[#2e2e2a] rounded-lg px-3 py-2.5 text-[14px] text-[#e8e6e0] appearance-none focus:outline-none focus:border-[#4a7c59]"
              >
                {ISSUE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={3}
                className="w-full bg-[#111110] border border-[#2e2e2a] rounded-lg px-3 py-2 text-[14px] text-[#e8e6e0] placeholder:text-[#4a4940] focus:outline-none focus:border-[#4a7c59] resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowIssue(false)}
                  className="flex-1 h-[44px] rounded-lg text-[14px] font-medium bg-[#1f1f1c] border border-[#2e2e2a] text-[#9b9a94] hover:bg-[#252522] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIssue}
                  className="flex-1 h-[44px] rounded-lg text-[14px] font-medium bg-[#2e1a1a] text-[#d46b6b] hover:bg-[#3e2020] transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {submitting && (
        <div className="flex items-center justify-center h-[60px] text-[#4a7c59] text-[15px] font-medium gap-2">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-[#4a7c59] border-t-transparent rounded-full" />
          Saving…
        </div>
      )}

      {stop.status === 'scheduled' && (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4 text-center text-[14px] text-[#8b8bd4]">
          This stop is scheduled. Mark prior stops delivered first.
        </div>
      )}

      {stop.status === 'delivered' && (
        <div className="bg-[#1a2e1a] border border-[#2a4a2a] rounded-xl p-4">
          <div className="text-[#6db86d] font-semibold text-[16px] mb-1">✓ Delivered</div>
          {stop.deliveredAt && (
            <div className="text-[#4a7c59] text-[13px]">Marked at {stop.deliveredAt}</div>
          )}
          {stop.driverNotes && (
            <div className="text-[#9b9a94] text-[13px] mt-2 italic">{stop.driverNotes}</div>
          )}
        </div>
      )}

      {stop.status === 'failed' && (
        <div className="bg-[#2e1a1a] border border-[#4a2a2a] rounded-xl p-4">
          <div className="text-[#d46b6b] font-semibold text-[16px] mb-1">Issue reported</div>
          {stop.issueReason && <div className="text-[#e8e6e0] text-[14px]">{stop.issueReason}</div>}
          {stop.driverNotes && (
            <div className="text-[#9b9a94] text-[13px] mt-2 italic">{stop.driverNotes}</div>
          )}
        </div>
      )}
    </div>
  );
}
