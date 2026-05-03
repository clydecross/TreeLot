'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

async function assertAdmin() {
  const user = await currentUser();
  const email = user?.emailAddresses
    .find(e => e.id === user.primaryEmailAddressId)
    ?.emailAddress;
  if (!user || email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    throw new Error('Unauthorized');
  }
}

export async function updateOrg(orgId: string, data: { name: string; plan: string }) {
  await assertAdmin();
  await prisma.organization.update({
    where: { id: orgId },
    data:  { name: data.name.trim(), plan: data.plan as 'starter' | 'pro' | 'enterprise' },
  });
  revalidatePath('/admin');
  revalidatePath('/admin/sales');
}

export async function deleteOrg(orgId: string) {
  await assertAdmin();

  const locations = await prisma.location.findMany({
    where:  { orgId },
    select: { id: true },
  });
  const locationIds = locations.map(l => l.id);

  // Delete in FK-safe order — invitations before users (Restrict constraint)
  await prisma.$transaction([
    prisma.delivery.deleteMany({ where: { locationId: { in: locationIds } } }),
    prisma.purchase.deleteMany({ where: { locationId: { in: locationIds } } }),
    prisma.invitation.deleteMany({ where: { orgId } }),
    prisma.customer.deleteMany({ where: { orgId } }),
    prisma.user.deleteMany({ where: { orgId } }),
    prisma.location.deleteMany({ where: { orgId } }),
    prisma.organization.delete({ where: { id: orgId } }),
  ]);

  revalidatePath('/admin');
  revalidatePath('/admin/sales');
}
