import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export type AppUser = {
  id: string;
  clerkId: string;
  orgId: string;
  locationId: string | null;
  role: 'owner' | 'manager' | 'staff' | 'driver';
  name: string;
  email: string;
};

export type Context = { db: typeof prisma; user: AppUser | null };

const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? 'e82e886b-842a-44fc-9a0b-91821cf8e6e5';

export async function createContext(): Promise<Context> {
  let user: AppUser | null = null;
  try {
    const cookieStore = await cookies();

    // Public demo mode — no Clerk auth required.
    if (cookieStore.get('demo_mode')?.value === '1') {
      const orgUser = await prisma.user.findFirst({
        where: { orgId: DEMO_ORG_ID },
        select: { id: true, clerkId: true, orgId: true, locationId: true, role: true, name: true, email: true },
      });
      if (orgUser) return { db: prisma, user: { ...orgUser, role: 'owner' } };
    }

    const { userId: clerkId } = await auth();
    if (clerkId) {
      // Superadmin demo-view: if the cookie matches this Clerk session, impersonate
      // the first user of the selected org so the full dashboard renders as that lot.
      const demoOrgId   = cookieStore.get('superadmin_org')?.value;
      const demoClerkId = cookieStore.get('superadmin_clerk_id')?.value;

      if (demoOrgId && demoClerkId === clerkId) {
        const orgUser = await prisma.user.findFirst({
          where: { orgId: demoOrgId },
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
  return { db: prisma, user };
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
