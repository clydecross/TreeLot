'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input as UIInput } from '@/components/ui/Input';
import { Select as UISelect } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

type Tab = 'org' | 'locations' | 'users';
type Role = 'owner' | 'manager' | 'staff' | 'driver';

const ROLE_BADGE_VARIANT: Record<Role, 'brand' | 'info' | 'neutral' | 'success'> = {
  owner:   'brand',
  manager: 'info',
  staff:   'neutral',
  driver:  'success',
};

function fmtDate(iso: string | Date | null | undefined) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('org');
  const meQuery = trpc.users.me.useQuery();

  if (meQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-app">
        <div className="text-sm text-fg-muted">Loading…</div>
      </div>
    );
  }

  const me = meQuery.data;
  if (!me) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-app">
        <div className="text-sm text-error-fg">Not signed in</div>
      </div>
    );
  }

  const role = me.role as Role;
  const isOwner   = role === 'owner';
  const isManager = role === 'manager';
  const canView   = isOwner || isManager;

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-app">
        <Card padding="lg" className="text-center text-fg-muted max-w-md">
          <div className="text-2xl font-semibold mb-2 text-fg-default">Access denied</div>
          <div className="text-sm">
            Settings are available to managers and owners only.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-app p-4 lg:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold text-fg-default">
            Settings
          </div>
          <RolePill role={role} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border-default overflow-x-auto">
          {(['org', 'locations', 'users'] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? 'primary' : 'ghost'}
              onClick={() => setTab(t)}
              className="rounded-b-none"
            >
              {t === 'org' ? 'Organization' : t === 'locations' ? 'Locations' : 'Users'}
            </Button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'org'       && <OrgTab       isOwner={isOwner} />}
        {tab === 'locations' && <LocationsTab isOwner={isOwner} />}
        {tab === 'users'     && <UsersTab     isOwner={isOwner} canManage={isOwner || isManager} currentUserId={me.id} />}
      </div>
    </div>
  );
}

// ── ORG TAB ───────────────────────────────────────────────────────────────────
function OrgTab({ isOwner }: { isOwner: boolean }) {
  const orgQuery = trpc.admin.getOrg.useQuery();
  const utils = trpc.useUtils();
  const updateOrg = trpc.admin.updateOrg.useMutation({
    onSuccess: () => { utils.admin.getOrg.invalidate(); utils.users.me.invalidate(); },
  });

  const [name, setName]       = useState('');
  const [taxPct, setTaxPct]   = useState('');

  useEffect(() => {
    if (orgQuery.data) {
      setName(orgQuery.data.name);
      setTaxPct((orgQuery.data.taxRateBps / 100).toFixed(2));
    }
  }, [orgQuery.data]);

  if (orgQuery.isLoading) {
    return <div className="text-sm text-fg-muted">Loading…</div>;
  }
  if (!orgQuery.data) {
    return <div className="text-sm text-error-fg">Failed to load organization</div>;
  }

  const org = orgQuery.data;

  function handleSave() {
    const bps = Math.round(parseFloat(taxPct) * 100);
    if (Number.isNaN(bps) || bps < 0 || bps > 2000) return;
    updateOrg.mutate({
      name: name.trim() || undefined,
      taxRateBps: bps,
    });
  }

  const dirty = name.trim() !== org.name || Math.round(parseFloat(taxPct || '0') * 100) !== org.taxRateBps;

  return (
    <Card padding="lg" className="flex flex-col gap-4 max-w-[540px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Organization name">
          <UIInput value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
        </Field>

        <Field label="Tax rate (%)">
          <UIInput
            value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            disabled={!isOwner}
            type="number"
          />
          <div className="text-xs mt-1 text-fg-muted">
            Stored as {Math.round(parseFloat(taxPct || '0') * 100) || 0} basis points · max 20% (2000 bps)
          </div>
        </Field>

        <div>
          <div className="text-xs uppercase tracking-wide mb-1 text-fg-muted">Plan</div>
          <Badge variant="info" className="uppercase">{org.plan}</Badge>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide mb-1 text-fg-muted">Created</div>
          <div className="text-sm text-fg-default">{fmtDate(org.createdAt)}</div>
        </div>
      </div>

      {updateOrg.error && (
        <div className="text-xs text-error-fg">{updateOrg.error.message}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-2 pt-1">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!isOwner || !dirty || updateOrg.isPending}
          loading={updateOrg.isPending}
          title={!isOwner ? 'Owner-only' : undefined}
          fullWidth
          className="md:w-auto"
        >
          {updateOrg.isPending ? 'Saving…' : isOwner ? 'Save changes' : 'Owner-only'}
        </Button>
        {!isOwner && <LockHint />}
      </div>
    </Card>
  );
}

// ── LOCATIONS TAB ─────────────────────────────────────────────────────────────
function LocationsTab({ isOwner }: { isOwner: boolean }) {
  const listQuery = trpc.admin.listLocations.useQuery();
  const utils = trpc.useUtils();

  const createLoc = trpc.admin.createLocation.useMutation({
    onSuccess: () => { utils.admin.listLocations.invalidate(); setAdding(false); },
  });
  const updateLoc = trpc.admin.updateLocation.useMutation({
    onSuccess: () => { utils.admin.listLocations.invalidate(); setEditingId(null); },
  });
  const deleteLoc = trpc.admin.deleteLocation.useMutation({
    onSuccess: () => { utils.admin.listLocations.invalidate(); setDeletingId(null); },
  });

  const [adding, setAdding]         = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [qrId, setQrId]             = useState<string | null>(null);

  if (listQuery.isLoading) return <div className="text-sm text-fg-muted">Loading…</div>;

  const rows = listQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-fg-muted">{rows.length} location{rows.length === 1 ? '' : 's'}</div>
        {isOwner ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setAdding(true); setEditingId(null); }}
            fullWidth
            className="sm:w-auto"
          >
            + Add location
          </Button>
        ) : (
          <LockHint label="Add location is owner-only" />
        )}
      </div>

      {adding && (
        <LocationForm
          mode="create"
          saving={createLoc.isPending}
          error={createLoc.error?.message ?? null}
          onCancel={() => setAdding(false)}
          onSubmit={(data) => createLoc.mutate(data)}
        />
      )}

      {/* Mobile card-stack */}
      <div className="lg:hidden flex flex-col gap-2">
        {rows.length === 0 && (
          <Card padding="lg" className="text-center text-sm text-fg-muted">
            No locations yet.
          </Card>
        )}
        {rows.map((loc) => {
          const isEditing  = editingId === loc.id;
          const isDeleting = deletingId === loc.id;
          const showingQr  = qrId === loc.id;
          return (
            <Fragment key={loc.id}>
              <Card padding="md" className="flex flex-col gap-2">
                <div>
                  <div className="text-fg-default font-semibold">{loc.name}</div>
                  <div className="text-fg-muted text-[12px]">{loc.address}</div>
                  <div className="text-fg-muted text-[12px] mt-0.5">{loc.timezone}</div>
                </div>
                <div className="text-fg-muted text-[12px]">
                  {loc._count.purchases} purchase{loc._count.purchases === 1 ? '' : 's'} · {loc._count.users} user{loc._count.users === 1 ? '' : 's'}
                </div>
                <div className="flex gap-1.5 flex-wrap pt-1 border-t border-border-subtle">
                  <Button
                    variant={showingQr ? 'soft' : 'secondary'}
                    size="sm"
                    onClick={() => { setQrId(showingQr ? null : loc.id); setEditingId(null); setDeletingId(null); }}
                  >
                    Device URL
                  </Button>
                  {isOwner && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setEditingId(isEditing ? null : loc.id); setDeletingId(null); setQrId(null); }}
                      >
                        {isEditing ? 'Close' : 'Edit'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => { setDeletingId(isDeleting ? null : loc.id); setEditingId(null); setQrId(null); }}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </Card>
              {showingQr && (
                <DriverDeviceUrl
                  locationId={loc.id}
                  locationName={loc.name}
                  onClose={() => setQrId(null)}
                />
              )}
              {isEditing && (
                <LocationForm
                  mode="edit"
                  initial={{ name: loc.name, address: loc.address, timezone: loc.timezone }}
                  saving={updateLoc.isPending}
                  error={updateLoc.error?.message ?? null}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) => updateLoc.mutate({ id: loc.id, ...data })}
                />
              )}
              {isDeleting && (
                <Card padding="md">
                  <div className="flex flex-col gap-3">
                    <span className="text-sm text-fg-default">
                      Delete <strong>{loc.name}</strong>? This cannot be undone.
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteLoc.mutate({ id: loc.id })}
                        disabled={deleteLoc.isPending}
                        loading={deleteLoc.isPending}
                      >
                        {deleteLoc.isPending ? 'Deleting…' : 'Confirm delete'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {deleteLoc.error && (
                      <span className="text-xs text-error-fg">{deleteLoc.error.message}</span>
                    )}
                  </div>
                </Card>
              )}
            </Fragment>
          );
        })}
      </div>

      <Card padding="none" className="hidden lg:block overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-inset">
            <tr>
              <Th>Name</Th>
              <Th>Address</Th>
              <Th>Timezone</Th>
              <Th align="right">Purchases</Th>
              <Th align="right">Users</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="bg-bg-surface">
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-fg-muted">
                  No locations yet.
                </td>
              </tr>
            )}
            {rows.map((loc, i) => {
              const isEditing  = editingId === loc.id;
              const isDeleting = deletingId === loc.id;
              const showingQr  = qrId === loc.id;
              return (
                <Fragment key={loc.id}>
                  <tr
                    className={cn(
                      'border-t border-border-subtle',
                      i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset',
                    )}
                  >
                    <Td><span className="text-fg-default font-medium">{loc.name}</span></Td>
                    <Td>{loc.address}</Td>
                    <Td><span className="text-fg-muted">{loc.timezone}</span></Td>
                    <Td align="right">{loc._count.purchases}</Td>
                    <Td align="right">{loc._count.users}</Td>
                    <Td align="right">
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant={showingQr ? 'soft' : 'secondary'}
                          size="sm"
                          onClick={() => { setQrId(showingQr ? null : loc.id); setEditingId(null); setDeletingId(null); }}
                        >
                          Device URL
                        </Button>
                        {isOwner && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => { setEditingId(isEditing ? null : loc.id); setDeletingId(null); setQrId(null); }}
                            >
                              {isEditing ? 'Close' : 'Edit'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => { setDeletingId(isDeleting ? null : loc.id); setEditingId(null); setQrId(null); }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                  {showingQr && (
                    <tr className="bg-bg-app">
                      <td colSpan={6} className="p-3">
                        <DriverDeviceUrl
                          locationId={loc.id}
                          locationName={loc.name}
                          onClose={() => setQrId(null)}
                        />
                      </td>
                    </tr>
                  )}
                  {isEditing && (
                    <tr className="bg-bg-app">
                      <td colSpan={6} className="p-3">
                        <LocationForm
                          mode="edit"
                          initial={{ name: loc.name, address: loc.address, timezone: loc.timezone }}
                          saving={updateLoc.isPending}
                          error={updateLoc.error?.message ?? null}
                          onCancel={() => setEditingId(null)}
                          onSubmit={(data) => updateLoc.mutate({ id: loc.id, ...data })}
                        />
                      </td>
                    </tr>
                  )}
                  {isDeleting && (
                    <tr className="bg-bg-app">
                      <td colSpan={6} className="p-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-fg-default">
                            Delete <strong>{loc.name}</strong>? This cannot be undone.
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteLoc.mutate({ id: loc.id })}
                            disabled={deleteLoc.isPending}
                            loading={deleteLoc.isPending}
                          >
                            {deleteLoc.isPending ? 'Deleting…' : 'Confirm delete'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </Button>
                          {deleteLoc.error && (
                            <span className="text-xs text-error-fg">{deleteLoc.error.message}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Driver device URL panel ────────────────────────────────────────────────
// Reveals the device URL + QR for a single location so an owner can hand off
// the link (or print/scan the QR) when setting up a new lot tablet.
function DriverDeviceUrl({
  locationId,
  locationName,
  onClose,
}: {
  locationId:   string;
  locationName: string;
  onClose:      () => void;
}) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  // window is undefined on the server — pull the origin once on mount.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/driver/${locationId}` : '';

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked — user can still select the text */
    }
  }

  function printQr() {
    if (!url) return;
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    // Inline-only HTML; no app stylesheets, designed for a small printout.
    w.document.write(`<!doctype html>
<html><head><title>Driver device — ${escapeHtml(locationName)}</title>
<style>
  body { font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         color: #2C2C2A; padding: 32px; text-align: center; }
  h1   { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .sub { color: #888780; font-size: 12px; margin-bottom: 24px; }
  .qr  { display: inline-block; padding: 16px; border: 1px solid #d3d1c7; border-radius: 12px; background: #fff; }
  .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
         font-size: 11px; word-break: break-all; margin-top: 16px; color: #444441; }
  .tip { margin-top: 18px; font-size: 11px; color: #888780; max-width: 320px; margin-left: auto; margin-right: auto; }
</style></head><body>
  <h1>${escapeHtml(locationName)}</h1>
  <div class="sub">Driver device — TreeLot</div>
  <div class="qr" id="qr"></div>
  <div class="url">${escapeHtml(url)}</div>
  <div class="tip">Open this URL on the lot tablet, then add to home screen.</div>
  <script>setTimeout(function(){window.print();}, 200);</script>
</body></html>`);
    // Render a simple QR via the same library would require module loading in
    // the popup, so re-use the SVG we already have in the panel by serializing
    // it into the popup document.
    const svg = document.getElementById(`qr-svg-${locationId}`);
    if (svg) {
      const slot = w.document.getElementById('qr');
      if (slot) slot.innerHTML = svg.outerHTML;
    }
    w.document.close();
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      <div className="bg-bg-surface border border-border-default rounded-[var(--radius-lg)] p-3 shrink-0">
        {url ? (
          <QRCodeSVG
            id={`qr-svg-${locationId}`}
            value={url}
            size={132}
            bgColor="transparent"
            fgColor="#2C2C2A"
            level="M"
          />
        ) : (
          <div className="w-[132px] h-[132px]" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-1">
            Device URL — {locationName}
          </div>
          <div
            className="text-[12px] font-mono break-all bg-bg-inset border border-border-subtle rounded-[var(--radius-md)] px-2.5 py-1.5 text-fg-default select-all"
          >
            {url || '…'}
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="primary" onClick={copy} disabled={!url}>
            {copied ? '✓ Copied' : 'Copy URL'}
          </Button>
          <Button size="sm" variant="secondary" onClick={printQr} disabled={!url}>
            Print QR
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="text-[11px] text-fg-muted leading-relaxed">
          On the lot tablet, open this URL once and add to the home screen.
          Drivers will sign in with their PIN. The URL is safe to share with
          staff but anyone with it can see the driver list, so don&rsquo;t post
          it publicly.
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function LocationForm({
  mode,
  initial,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: { name: string; address: string; timezone: string };
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (data: { name: string; address: string; timezone: string }) => void;
}) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [address, setAddress]   = useState(initial?.address ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? 'America/Chicago');

  const ok = name.trim().length > 0 && address.trim().length > 0;

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wide text-fg-muted">
        {mode === 'create' ? 'New location' : 'Edit location'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name *">
          <UIInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Timezone">
          <UIInput value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </Field>
      </div>
      <Field label="Address *">
        <UIInput value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      {error && <div className="text-xs text-error-fg">{error}</div>}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSubmit({ name: name.trim(), address: address.trim(), timezone: timezone.trim() })}
          disabled={!ok || saving}
          loading={saving}
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ── USERS TAB ─────────────────────────────────────────────────────────────────
function UsersTab({
  isOwner,
  canManage,
  currentUserId,
}: {
  isOwner: boolean;
  canManage: boolean;
  currentUserId: string;
}) {
  const usersQuery = trpc.admin.listUsers.useQuery();
  const locsQuery  = trpc.admin.listLocations.useQuery();
  const invitesQuery = trpc.admin.listInvitations.useQuery({}, { enabled: canManage });
  const utils = trpc.useUtils();

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setEditingId(null); },
  });
  const setPin = trpc.admin.setUserPin.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setPinId(null); },
  });
  const removeUser = trpc.admin.removeUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setDeletingId(null); },
  });
  const inviteUser = trpc.admin.inviteUser.useMutation({
    onSuccess: () => {
      utils.admin.listInvitations.invalidate();
      setLastInvitedEmail(inviteEmailRef.current);
      setInviting(false);
    },
  });
  const revokeInvite = trpc.admin.revokeInvitation.useMutation({
    onSuccess: () => utils.admin.listInvitations.invalidate(),
  });

  const [editingId, setEditingId]     = useState<string | null>(null);
  const [pinId, setPinId]             = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [inviting, setInviting]       = useState(false);
  const [lastInvitedEmail, setLastInvitedEmail] = useState<string | null>(null);
  const inviteEmailRef                = useRef<string>('');

  if (usersQuery.isLoading) return <div className="text-sm text-fg-muted">Loading…</div>;

  const users = usersQuery.data ?? [];
  const locs  = locsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-fg-muted">
          {users.length} user{users.length === 1 ? '' : 's'}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {!isOwner && <LockHint label="Edit / Remove are owner-only" />}
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setInviting((v) => !v); setLastInvitedEmail(null); }}
              fullWidth
              className="sm:w-auto"
            >
              {inviting ? 'Close' : '+ Invite user'}
            </Button>
          )}
        </div>
      </div>

      {inviting && canManage && (
        <InviteForm
          locations={locs}
          saving={inviteUser.isPending}
          error={inviteUser.error?.message ?? null}
          onCancel={() => setInviting(false)}
          onSubmit={(data) => {
            inviteEmailRef.current = data.email;
            inviteUser.mutate(data);
          }}
        />
      )}

      {lastInvitedEmail && !inviting && (
        <Card variant="inset" padding="sm" className="text-sm text-fg-default">
          Invitation sent to <strong>{lastInvitedEmail}</strong>.
        </Card>
      )}

      {canManage && invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wide text-fg-muted">Pending invitations</div>

          {/* Mobile card-stack */}
          <div className="lg:hidden flex flex-col gap-2">
            {invites.map((inv) => (
              <Card key={inv.id} padding="md" className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-fg-default font-semibold break-all">{inv.email}</div>
                    <div className={cn('text-[12px] mt-0.5', inv.location ? 'text-fg-default' : 'text-fg-muted')}>
                      {inv.location?.name ?? 'Org-wide'}
                    </div>
                  </div>
                  <RolePill role={inv.role as Role} />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <span className="text-fg-muted text-[12px]">Sent {fmtDate(inv.createdAt)}</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => revokeInvite.mutate({ id: inv.id })}
                    disabled={revokeInvite.isPending}
                    loading={revokeInvite.isPending && revokeInvite.variables?.id === inv.id}
                  >
                    Revoke
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card padding="none" className="hidden lg:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-inset">
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Location</Th>
                  <Th>Sent</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv, i) => (
                  <tr
                    key={inv.id}
                    className={cn(
                      'border-t border-border-subtle',
                      i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset',
                    )}
                  >
                    <Td><span className="text-fg-default font-medium">{inv.email}</span></Td>
                    <Td><RolePill role={inv.role as Role} /></Td>
                    <Td>
                      <span className={inv.location ? 'text-fg-default' : 'text-fg-muted'}>
                        {inv.location?.name ?? 'Org-wide'}
                      </span>
                    </Td>
                    <Td><span className="text-fg-muted">{fmtDate(inv.createdAt)}</span></Td>
                    <Td align="right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => revokeInvite.mutate({ id: inv.id })}
                        disabled={revokeInvite.isPending}
                        loading={revokeInvite.isPending && revokeInvite.variables?.id === inv.id}
                      >
                        Revoke
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {revokeInvite.error && (
            <div className="text-xs text-error-fg">{revokeInvite.error.message}</div>
          )}
        </div>
      )}

      {/* Mobile card-stack */}
      <div className="lg:hidden flex flex-col gap-2">
        {users.length === 0 && (
          <Card padding="lg" className="text-center text-sm text-fg-muted">
            No users.
          </Card>
        )}
        {users.map((u) => {
          const isEditing  = editingId  === u.id;
          const isPinning  = pinId      === u.id;
          const isDeleting = deletingId === u.id;
          const isSelf     = u.id === currentUserId;
          return (
            <Fragment key={u.id}>
              <Card padding="md" className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-fg-default font-semibold">
                      {u.name}
                      {isSelf && <span className="text-xs ml-2 font-normal text-fg-muted">(you)</span>}
                    </div>
                    <div className="text-fg-muted text-[12px] break-all">{u.email}</div>
                  </div>
                  <RolePill role={u.role as Role} />
                </div>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[12px]">
                  <span className={u.location ? 'text-fg-default' : 'text-fg-muted'}>
                    {u.location?.name ?? 'Org-wide'}
                  </span>
                  {u.hasPin && <Badge variant="success" size="sm">PIN set</Badge>}
                  <span className="text-fg-muted">· Joined {fmtDate(u.createdAt)}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap pt-2 border-t border-border-subtle">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setEditingId(isEditing ? null : u.id); setPinId(null); setDeletingId(null); }}
                    disabled={!isOwner}
                    title={!isOwner ? 'Owner-only' : undefined}
                  >
                    {isOwner ? (isEditing ? 'Close' : 'Edit') : 'View'}
                  </Button>
                  {isOwner && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setPinId(isPinning ? null : u.id); setEditingId(null); setDeletingId(null); }}
                      >
                        {isPinning ? 'Close' : 'Set PIN'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => { setDeletingId(isDeleting ? null : u.id); setEditingId(null); setPinId(null); }}
                        disabled={isSelf}
                        title={isSelf ? 'Cannot remove yourself' : undefined}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </Card>
              {isEditing && (
                <UserEditForm
                  user={u}
                  locations={locs}
                  isSelf={isSelf}
                  readonly={!isOwner}
                  saving={updateUser.isPending}
                  error={updateUser.error?.message ?? null}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) => updateUser.mutate({ id: u.id, ...data })}
                />
              )}
              {isPinning && isOwner && (
                <PinForm
                  name={u.name}
                  saving={setPin.isPending}
                  error={setPin.error?.message ?? null}
                  onCancel={() => setPinId(null)}
                  onSubmit={(pin) => setPin.mutate({ id: u.id, pin })}
                />
              )}
              {isDeleting && isOwner && !isSelf && (
                <Card padding="md">
                  <div className="flex flex-col gap-3">
                    <span className="text-sm text-fg-default">
                      Remove <strong>{u.name}</strong>? They will lose access immediately.
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeUser.mutate({ id: u.id })}
                        disabled={removeUser.isPending}
                        loading={removeUser.isPending}
                      >
                        {removeUser.isPending ? 'Removing…' : 'Confirm remove'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {removeUser.error && (
                      <span className="text-xs text-error-fg">{removeUser.error.message}</span>
                    )}
                  </div>
                </Card>
              )}
            </Fragment>
          );
        })}
      </div>

      <Card padding="none" className="hidden lg:block overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-inset">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Location</Th>
              <Th>PIN</Th>
              <Th>Joined</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr className="bg-bg-surface">
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-fg-muted">
                  No users.
                </td>
              </tr>
            )}
            {users.map((u, i) => {
              const isEditing  = editingId  === u.id;
              const isPinning  = pinId      === u.id;
              const isDeleting = deletingId === u.id;
              const isSelf     = u.id === currentUserId;
              return (
                <Fragment key={u.id}>
                  <tr
                    className={cn(
                      'border-t border-border-subtle',
                      i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-inset',
                    )}
                  >
                    <Td>
                      <span className="text-fg-default font-medium">{u.name}</span>
                      {isSelf && <span className="text-xs ml-2 text-fg-muted">(you)</span>}
                    </Td>
                    <Td><span className="text-fg-muted">{u.email}</span></Td>
                    <Td><RolePill role={u.role as Role} /></Td>
                    <Td>
                      <span className={u.location ? 'text-fg-default' : 'text-fg-muted'}>
                        {u.location?.name ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      {u.hasPin ? (
                        <Badge variant="success">PIN set</Badge>
                      ) : (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </Td>
                    <Td><span className="text-fg-muted">{fmtDate(u.createdAt)}</span></Td>
                    <Td align="right">
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setEditingId(isEditing ? null : u.id); setPinId(null); setDeletingId(null); }}
                          disabled={!isOwner}
                          title={!isOwner ? 'Owner-only' : undefined}
                        >
                          {isOwner ? (isEditing ? 'Close' : 'Edit') : 'View'}
                        </Button>
                        {isOwner && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => { setPinId(isPinning ? null : u.id); setEditingId(null); setDeletingId(null); }}
                            >
                              {isPinning ? 'Close' : 'Set PIN'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => { setDeletingId(isDeleting ? null : u.id); setEditingId(null); setPinId(null); }}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot remove yourself' : undefined}
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>

                  {isEditing && (
                    <tr className="bg-bg-app">
                      <td colSpan={7} className="p-3">
                        <UserEditForm
                          user={u}
                          locations={locs}
                          isSelf={isSelf}
                          readonly={!isOwner}
                          saving={updateUser.isPending}
                          error={updateUser.error?.message ?? null}
                          onCancel={() => setEditingId(null)}
                          onSubmit={(data) => updateUser.mutate({ id: u.id, ...data })}
                        />
                      </td>
                    </tr>
                  )}

                  {isPinning && isOwner && (
                    <tr className="bg-bg-app">
                      <td colSpan={7} className="p-3">
                        <PinForm
                          name={u.name}
                          saving={setPin.isPending}
                          error={setPin.error?.message ?? null}
                          onCancel={() => setPinId(null)}
                          onSubmit={(pin) => setPin.mutate({ id: u.id, pin })}
                        />
                      </td>
                    </tr>
                  )}

                  {isDeleting && isOwner && !isSelf && (
                    <tr className="bg-bg-app">
                      <td colSpan={7} className="p-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-fg-default">
                            Remove <strong>{u.name}</strong>? They will lose access immediately.
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => removeUser.mutate({ id: u.id })}
                            disabled={removeUser.isPending}
                            loading={removeUser.isPending}
                          >
                            {removeUser.isPending ? 'Removing…' : 'Confirm remove'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </Button>
                          {removeUser.error && (
                            <span className="text-xs text-error-fg">{removeUser.error.message}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function InviteForm({
  locations,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  locations: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (data: {
    email: string;
    role: 'manager' | 'staff' | 'driver';
    locationId: string | null;
  }) => void;
}) {
  const [email, setEmail]           = useState('');
  const [role, setRole]             = useState<'manager' | 'staff' | 'driver'>('staff');
  const [locationId, setLocationId] = useState<string | ''>('');

  // Staff/driver must have a location; manager may be org-wide.
  const locationRequired = role === 'staff' || role === 'driver';
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ok = emailValid && (!locationRequired || locationId !== '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    onSubmit({
      email: email.trim().toLowerCase(),
      role,
      locationId: locationId === '' ? null : locationId,
    });
  }

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wide text-fg-muted">Invite user</div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Email *">
            <UIInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="user@example.com"
              required
            />
          </Field>
          <Field label="Role">
            <UISelect
              value={role}
              onChange={(e) => {
                const r = e.target.value as 'manager' | 'staff' | 'driver';
                setRole(r);
                if (r === 'manager' && locationId === '') {
                  // ok — manager can be org-wide
                }
              }}
            >
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="driver">Driver</option>
            </UISelect>
          </Field>
          <Field label={locationRequired ? 'Location *' : 'Location'}>
            <UISelect
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">{locationRequired ? '— Select location —' : '— Org-wide —'}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </UISelect>
            {locationRequired && (
              <div className="text-xs mt-1 text-fg-muted">
                Required for staff and drivers
              </div>
            )}
          </Field>
        </div>
        {error && <div className="text-xs text-error-fg">{error}</div>}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!ok || saving}
            loading={saving}
          >
            {saving ? 'Sending…' : 'Send invitation'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UserEditForm({
  user,
  locations,
  isSelf,
  readonly,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  user: { id: string; name: string; email: string; phone: string | null; role: string; locationId: string | null };
  locations: { id: string; name: string }[];
  isSelf: boolean;
  readonly: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (data: {
    name?: string;
    email?: string;
    phone?: string;
    role?: Role;
    locationId?: string | null;
  }) => void;
}) {
  const [name, setName]             = useState(user.name);
  const [email, setEmail]           = useState(user.email);
  const [phone, setPhone]           = useState(user.phone ?? '');
  const [role, setRole]             = useState<Role>(user.role as Role);
  const [locationId, setLocationId] = useState<string | ''>(user.locationId ?? '');

  function handleSubmit() {
    onSubmit({
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      role,
      locationId: locationId === '' ? null : locationId,
    });
  }

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wide text-fg-muted">
        {readonly ? 'View user' : 'Edit user'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <UIInput value={name} onChange={(e) => setName(e.target.value)} disabled={readonly} />
        </Field>
        <Field label="Email">
          <UIInput value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={readonly} />
        </Field>
        <Field label="Phone">
          <UIInput value={phone} onChange={(e) => setPhone(e.target.value)} disabled={readonly} />
        </Field>
        <Field label="Role">
          <UISelect
            value={role}
            disabled={readonly}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="driver">Driver</option>
          </UISelect>
          {isSelf && (
            <div className="text-xs mt-1 text-fg-muted">You cannot demote yourself.</div>
          )}
        </Field>
        <Field label="Location">
          <UISelect
            value={locationId}
            disabled={readonly}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </UISelect>
        </Field>
      </div>
      {error && <div className="text-xs text-error-fg">{error}</div>}
      {!readonly && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
            loading={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      )}
      {readonly && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            Close
          </Button>
        </div>
      )}
    </Card>
  );
}

function PinForm({
  name,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  name: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const ok = /^\d{4}$/.test(pin);

  return (
    <Card padding="md" className="flex flex-col gap-3 max-w-[360px]">
      <div className="text-xs uppercase tracking-wide text-fg-muted">
        Set PIN for {name}
      </div>
      <Field label="4-digit PIN">
        <UIInput
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          maxLength={4}
          type="password"
        />
      </Field>
      {error && <div className="text-xs text-error-fg">{error}</div>}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSubmit(pin)}
          disabled={!ok || saving}
          loading={saving}
        >
          {saving ? 'Saving…' : 'Set PIN'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ── Small UI primitives ───────────────────────────────────────────────────────
function RolePill({ role }: { role: Role }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANT[role]} className="uppercase tracking-wider">
      {role}
    </Badge>
  );
}

function LockHint({ label = 'Owner-only' }: { label?: string }) {
  return (
    <span className="text-xs flex items-center gap-1 text-fg-muted" title={label}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {label}
    </span>
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
