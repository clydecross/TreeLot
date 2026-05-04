import { cookies } from 'next/headers';
import { clerkClient } from '@clerk/nextjs/server';

export const SUPERADMIN_ORG_COOKIE      = 'superadmin_org';
export const SUPERADMIN_CLERK_ID_COOKIE = 'superadmin_clerk_id';

/**
 * Returns the orgId the requester is allowed to impersonate, or null.
 *
 * The "view as another lot" cookies (set by /admin/view/[orgId]) are
 * forgeable — a normal signed-in user can set both on themselves. So
 * every CONSUMER must re-verify the requester is the real super-admin
 * before honoring them. Cookie equality with the current Clerk session
 * is checked first as a cheap pre-filter, then we re-fetch the Clerk
 * user and compare the primary email to ADMIN_EMAIL.
 *
 * Fails closed: any error (Clerk down, ADMIN_EMAIL unset, missing
 * cookies, email mismatch) returns null so the caller falls back to the
 * requester's own context.
 */
export async function readImpersonationTarget(
  clerkId: string | null | undefined,
): Promise<string | null> {
  if (!clerkId) return null;

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail) return null;

  const cookieStore   = await cookies();
  const targetOrgId   = cookieStore.get(SUPERADMIN_ORG_COOKIE)?.value;
  const cookieClerkId = cookieStore.get(SUPERADMIN_CLERK_ID_COOKIE)?.value;

  if (!targetOrgId || !cookieClerkId) return null;
  if (cookieClerkId !== clerkId)      return null;

  try {
    const client       = await clerkClient();
    const clerkUser    = await client.users.getUser(clerkId);
    const primaryEmail = clerkUser.emailAddresses
      .find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress?.toLowerCase();
    if (primaryEmail !== adminEmail) return null;
    return targetOrgId;
  } catch {
    return null;
  }
}
