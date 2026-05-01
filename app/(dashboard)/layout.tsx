import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  const dbUser = user
    ? await prisma.user.findUnique({
        where: { clerkId: user.id },
        select: { id: true, role: true },
      })
    : null;

  if (user && !dbUser) {
    redirect('/onboarding');
  }

  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.emailAddresses[0]?.emailAddress
    : '';

  const role = dbUser?.role ?? null;

  const currentTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <DashboardShell
      role={role}
      displayName={displayName ?? ''}
      currentTime={currentTime}
    >
      {children}
    </DashboardShell>
  );
}
