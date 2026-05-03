import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const adminEmail = process.env.ADMIN_EMAIL;
  const user = await currentUser();
  const primaryEmail = user?.emailAddresses
    .find(e => e.id === user.primaryEmailAddressId)
    ?.emailAddress;

  if (!user || primaryEmail?.toLowerCase() !== adminEmail?.toLowerCase()) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) return NextResponse.redirect(new URL('/admin', req.url));

  const res = NextResponse.redirect(new URL('/pos', req.url));
  const cookieOpts = { httpOnly: true, path: '/', maxAge: 60 * 60 * 8, sameSite: 'lax' } as const;
  res.cookies.set('superadmin_org',      orgId,   cookieOpts);
  res.cookies.set('superadmin_clerk_id', user.id, cookieOpts);
  return res;
}
