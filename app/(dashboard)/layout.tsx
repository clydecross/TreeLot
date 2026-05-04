import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { readImpersonationTarget } from '@/lib/superadmin-impersonation';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore  = await cookies();
  const isDemoPublic = cookieStore.get('demo_mode')?.value === '1';
  const DEMO_ORG_ID  = process.env.DEMO_ORG_ID ?? 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';

  // Public /demo mode — skip Clerk entirely, render as demo org owner.
  if (isDemoPublic) {
    const demoDbUser = await prisma.user.findFirst({
      where: { orgId: DEMO_ORG_ID },
      select: { org: { select: { name: true } }, location: { select: { name: true } } },
    });
    const orgName      = demoDbUser?.org?.name      ?? 'Demo';
    const locationName = demoDbUser?.location?.name ?? '';
    const currentTime  = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago', weekday: 'short', month: 'short',
      day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return (
      <DashboardShell role="owner" displayName="" currentTime={currentTime} orgName={orgName} locationName={locationName}>
        {children}
      </DashboardShell>
    );
  }

  const user = await currentUser();
  // Superadmin "view as another lot": fully gated by readImpersonationTarget,
  // which re-runs the ADMIN_EMAIL check on every render — cookies alone are
  // forgeable.
  const impersonateOrgId = await readImpersonationTarget(user?.id);
  const isDemo = !!impersonateOrgId;

  const dbUser = user
    ? isDemo
      ? await prisma.user.findFirst({
          where: { orgId: impersonateOrgId },
          select: { role: true, org: { select: { name: true } }, location: { select: { name: true } } },
        })
      : await prisma.user.findUnique({
          where: { clerkId: user.id },
          select: { role: true, org: { select: { name: true } }, location: { select: { name: true } } },
        })
    : null;

  if (user && !dbUser && !isDemo) {
    redirect('/onboarding');
  }

  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.emailAddresses[0]?.emailAddress
    : '';

  // Superadmin demo-view always gets owner-level access to see the full nav.
  const role = isDemo ? 'owner' : (dbUser?.role ?? null);

  const currentTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const orgName      = dbUser?.org?.name      ?? '';
  const locationName = dbUser?.location?.name ?? '';

  return (
    <div className="relative">
      {isDemo && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-amber-500 text-black text-[12px] font-medium">
          <span>Viewing as <strong>{orgName}</strong></span>
          <a href="/admin/view/exit" className="underline underline-offset-2">Exit demo view</a>
        </div>
      )}
      <DashboardShell
        role={role}
        displayName={displayName ?? ''}
        currentTime={currentTime}
        orgName={orgName}
        locationName={locationName}
      >
        {children}
      </DashboardShell>
    </div>
  );
}
