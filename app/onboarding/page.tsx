'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input as UIInput } from '@/components/ui/Input';
import { Select as UISelect } from '@/components/ui/Select';

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago',     label: 'Central (America/Chicago)' },
  { value: 'America/Denver',      label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage',   label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (Pacific/Honolulu)' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<
    | { status: 'ready'; orgName: string }
    | { status: 'invited'; orgName: string }
    | { status: 'needs_org_setup'; email: string; name: string }
    | null
  >(null);
  const startedRef = useRef(false);
  const redirectedRef = useRef(false);

  const bootstrap = trpc.users.bootstrap.useMutation({
    onSuccess: (data) => {
      setBootstrapError(null);
      if (data.status === 'ready') {
        setBootstrapResult({ status: 'ready', orgName: data.orgName });
      } else if (data.status === 'invited') {
        setBootstrapResult({ status: 'invited', orgName: data.orgName });
      } else if (data.status === 'needs_org_setup') {
        setBootstrapResult({
          status: 'needs_org_setup',
          email: data.email,
          name:  data.name,
        });
      }
    },
    onError: (err) => {
      setBootstrapError(err.message ?? 'Something went wrong setting up your account.');
    },
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    bootstrap.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect on ready / invited after a brief welcome message.
  useEffect(() => {
    if (!bootstrapResult) return;
    if (bootstrapResult.status === 'ready' || bootstrapResult.status === 'invited') {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      const t = setTimeout(() => router.replace('/pos'), 1000);
      return () => clearTimeout(t);
    }
  }, [bootstrapResult, router]);

  if (bootstrapError) {
    return (
      <CenterShell>
        <Card variant="elevated" radius="xl" padding="lg" className="flex flex-col gap-3 w-full max-w-[480px]">
          <div className="text-base font-semibold text-fg-default">Something went wrong</div>
          <div className="text-sm text-error-fg">{bootstrapError}</div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBootstrapError(null);
                redirectedRef.current = false;
                bootstrap.mutate();
              }}
            >
              Try again
            </Button>
          </div>
        </Card>
      </CenterShell>
    );
  }

  if (!bootstrapResult) {
    return (
      <CenterShell>
        <Card
          variant="elevated"
          radius="xl"
          padding="lg"
          className="flex flex-col items-center gap-4 px-10 py-12"
          style={{ minWidth: 320 }}
        >
          <div className="text-center text-[16px] font-medium text-fg-default">
            Setting up your account...
          </div>
          <div
            aria-label="Loading"
            className="rounded-full border-[3px] border-border-subtle border-t-brand"
            style={{ width: 28, height: 28, animation: 'treelot-spin 0.9s linear infinite' }}
          />
        </Card>
        <SpinnerKeyframes />
      </CenterShell>
    );
  }

  if (bootstrapResult.status === 'ready' || bootstrapResult.status === 'invited') {
    return (
      <CenterShell>
        <Card
          variant="elevated"
          radius="xl"
          padding="lg"
          className="flex flex-col items-center gap-3 px-10 py-12"
          style={{ minWidth: 320 }}
        >
          <div className="text-center text-[18px] font-semibold text-fg-default">
            Welcome to {bootstrapResult.orgName || 'TreeLot'}!
          </div>
          <div className="text-center text-sm text-fg-muted">
            Taking you to your point of sale…
          </div>
          <div
            aria-label="Loading"
            className="rounded-full border-[3px] border-border-subtle border-t-brand"
            style={{ width: 24, height: 24, animation: 'treelot-spin 0.9s linear infinite' }}
          />
        </Card>
        <SpinnerKeyframes />
      </CenterShell>
    );
  }

  // needs_org_setup
  return (
    <CenterShell>
      <CreateOrgForm
        defaultTimezone="America/Chicago"
        onCreated={() => router.replace('/pos')}
      />
    </CenterShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CreateOrgForm({
  defaultTimezone,
  onCreated,
}: {
  defaultTimezone: string;
  onCreated: () => void;
}) {
  const [orgName, setOrgName]               = useState('');
  const [locationName, setLocationName]     = useState('Main Lot');
  const [locationAddress, setLocationAddr]  = useState('');
  const [timezone, setTimezone]             = useState(defaultTimezone);
  const [taxRatePct, setTaxRatePct]         = useState('8.25');

  const createOrg = trpc.users.createOrg.useMutation({
    onSuccess: () => onCreated(),
  });

  const taxNum = Number.parseFloat(taxRatePct);
  const taxValid = !Number.isNaN(taxNum) && taxNum >= 0 && taxNum <= 20;
  const valid =
    orgName.trim().length > 0 &&
    locationName.trim().length > 0 &&
    locationAddress.trim().length > 0 &&
    taxValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    createOrg.mutate({
      orgName:         orgName.trim(),
      locationName:    locationName.trim(),
      locationAddress: locationAddress.trim(),
      timezone,
      taxRatePct:      taxNum,
    });
  }

  return (
    <Card
      variant="elevated"
      radius="xl"
      padding="lg"
      className="flex flex-col gap-4 w-full max-w-[480px]"
    >
      <div className="flex flex-col gap-1">
        <div className="text-[20px] font-semibold text-fg-default">Create your tree lot</div>
        <div className="text-sm text-fg-muted">
          You're the owner. Set up your org and your first location.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Organization name">
          <UIInput
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Smith Family Trees"
            autoFocus
            required
          />
        </Field>

        <Field label="Location name">
          <UIInput
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="Main Lot"
            required
          />
        </Field>

        <Field label="Location address">
          <UIInput
            value={locationAddress}
            onChange={(e) => setLocationAddr(e.target.value)}
            placeholder="123 Main St, Springfield, IL 62701"
            required
          />
        </Field>

        <Field label="Timezone">
          <UISelect value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </UISelect>
        </Field>

        <Field label="Tax rate (%)">
          <UIInput
            type="number"
            step="0.01"
            min="0"
            max="20"
            value={taxRatePct}
            onChange={(e) => setTaxRatePct(e.target.value)}
            trailing={<span className="text-fg-muted">%</span>}
            required
          />
          <div className="text-xs mt-1 text-fg-muted">
            Stored as {taxValid ? Math.round(taxNum * 100) : 0} basis points
          </div>
        </Field>

        {createOrg.error && (
          <Card variant="inset" padding="sm" className="text-sm text-error-fg">
            {createOrg.error.message}
          </Card>
        )}

        <div className="pt-1">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={!valid || createOrg.isPending}
            loading={createOrg.isPending}
          >
            {createOrg.isPending ? 'Creating…' : 'Create tree lot'}
          </Button>
        </div>
      </form>
    </Card>
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

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-4">
      {children}
    </div>
  );
}

function SpinnerKeyframes() {
  return (
    <style>{`
      @keyframes treelot-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
  );
}
