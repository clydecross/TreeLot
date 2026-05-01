import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
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

export async function createContext(): Promise<Context> {
  let user: AppUser | null = null;
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const dbUser = await prisma.user.findUnique({
        where: { clerkId },
        select: {
          id: true,
          clerkId: true,
          orgId: true,
          locationId: true,
          role: true,
          name: true,
          email: true,
        },
      });
      if (dbUser) user = dbUser;
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
