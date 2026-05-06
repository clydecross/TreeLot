import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import {
  DRIVER_SESSION_COOKIE,
  verifyDriverSession,
  type DriverSession,
} from '@/lib/driver-session';
import { readImpersonationTarget } from '@/lib/superadmin-impersonation';

export type AppUser = {
  id: string;
  clerkId: string;
  orgId: string;
  locationId: string | null;
  role: 'owner' | 'manager' | 'staff' | 'driver';
  name: string;
  email: string;
};

export type Context = {
  db: typeof prisma;
  user: AppUser | null;
  driver: DriverSession | null;
  ip: string | null;
  userAgent: string | null;
};

// Pulls the originating IP from the standard proxy headers Vercel sets. Falls
// back to the platform-specific x-real-ip. Returns null when called from a
// server component (no request) so callers must treat the value as optional.
function readClientIp(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    // first hop is the client; everything after is upstream proxies
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip');
}

const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';

export async function createContext(opts?: { req?: Request }): Promise<Context> {
  let user: AppUser | null = null;
  let driver: DriverSession | null = null;
  const ip        = readClientIp(opts?.req);
  const userAgent = opts?.req?.headers.get('user-agent') ?? null;
  try {
    const cookieStore = await cookies();

    const driverCookie = cookieStore.get(DRIVER_SESSION_COOKIE)?.value;
    if (driverCookie) driver = verifyDriverSession(driverCookie);

    // Public demo mode — no Clerk auth required.
    if (cookieStore.get('demo_mode')?.value === '1') {
      const orgUser = await prisma.user.findFirst({
        where: { orgId: DEMO_ORG_ID },
        select: { id: true, clerkId: true, orgId: true, locationId: true, role: true, name: true, email: true },
      });
      if (orgUser) return { db: prisma, user: { ...orgUser, role: 'owner' }, driver, ip, userAgent };
    }

    const { userId: clerkId } = await auth();
    if (clerkId) {
      // Superadmin "view as another lot": only honored after a fresh
      // ADMIN_EMAIL re-check on the current Clerk session. The cookies
      // alone are forgeable — see readImpersonationTarget for the full
      // gate.
      const impersonateOrgId = await readImpersonationTarget(clerkId);
      if (impersonateOrgId) {
        const orgUser = await prisma.user.findFirst({
          where: { orgId: impersonateOrgId },
          select: { id: true, clerkId: true, orgId: true, locationId: true, role: true, name: true, email: true },
        });
        if (orgUser) user = { ...orgUser, role: 'owner' };
      }

      if (!user) {
        const dbUser = await prisma.user.findUnique({
          where: { clerkId },
          select: { id: true, clerkId: true, orgId: true, locationId: true, role: true, name: true, email: true },
        });
        if (dbUser) user = dbUser;
      }
    }
  } catch {
    // auth() throws outside request scope or for /driver public routes — ignore
  }
  return { db: prisma, user, driver, ip, userAgent };
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

export function requireRole(...roles: AppUser['role'][]) {
  return isAuthed.unstable_pipe(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Requires role: ${roles.join(' or ')}`,
      });
    }
    return next({ ctx });
  });
}

export const ownerProcedure   = t.procedure.use(requireRole('owner'));
export const managerProcedure = t.procedure.use(requireRole('owner', 'manager'));
export const staffProcedure   = t.procedure.use(requireRole('owner', 'manager', 'staff'));
export const driverProcedure  = t.procedure.use(requireRole('driver'));

const isDriverSession = t.middleware(({ ctx, next }) => {
  if (!ctx.driver) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Driver session required' });
  }
  return next({ ctx: { ...ctx, driver: ctx.driver } });
});

export const driverSessionProcedure = t.procedure.use(isDriverSession);

const isSuperAdmin = t.middleware(async ({ ctx, next }) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ADMIN_EMAIL not configured' });

  const { userId: clerkId } = await auth();
  if (!clerkId) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkId);
  const primaryEmail = clerkUser.emailAddresses
    .find(e => e.id === clerkUser.primaryEmailAddressId)
    ?.emailAddress;

  if (primaryEmail?.toLowerCase() !== adminEmail.toLowerCase()) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Super-admin access only' });
  }

  return next({ ctx });
});

export const superadminProcedure = t.procedure.use(isSuperAdmin);
