import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/db';

export type Context = {
  db: typeof prisma;
};

export function createContext(): Context {
  return { db: prisma };
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
