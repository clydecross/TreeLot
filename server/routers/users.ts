import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { router, publicProcedure, protectedProcedure, staffProcedure } from '../trpc';

const roleSchema = z.enum(['owner', 'manager', 'staff', 'driver']);

export const usersRouter = router({
  // ── users.getByLocation ───────────────────────────────────────────────────
  // Returns users at the signed-in user's location (or org-wide if they
  // haven't been assigned to a location yet).
  getByLocation: staffProcedure
    .input(z.object({ role: roleSchema.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const where = ctx.user.locationId
        ? { locationId: ctx.user.locationId, ...(input?.role ? { role: input.role } : {}) }
        : { orgId: ctx.user.orgId,           ...(input?.role ? { role: input.role } : {}) };

      return ctx.db.user.findMany({
        where,
        select: {
          id:         true,
          name:       true,
          email:      true,
          role:       true,
          locationId: true,
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });
    }),

  // ── users.me ──────────────────────────────────────────────────────────────
  // Returns the currently signed-in user with org + location details.
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id:         true,
        name:       true,
        email:      true,
        role:       true,
        orgId:      true,
        locationId: true,
        org:        { select: { id: true, name: true, taxRateBps: true } },
        location:   { select: { id: true, name: true, address: true, timezone: true } },
      },
    });
    if (!user) return null;
    // Use ctx.user.role so demo-mode override (owner) flows through to the UI.
    return { ...user, role: ctx.user.role };
  }),

  // ── users.bootstrap ───────────────────────────────────────────────────────
  // Discriminated-union return based on whether the Clerk user already has a
  // User row, was invited, or needs to set up a brand-new org.
  //
  // status: 'ready'             → User already exists (or was created via invite)
  // status: 'invited'           → User just created from a pending invitation
  // status: 'needs_org_setup'   → No User, no invitation: render the create-org form
  bootstrap: publicProcedure.mutation(async ({ ctx }) => {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
    }

    // Already a member — nothing to do.
    const existing = await ctx.db.user.findUnique({
      where: { clerkId },
      select: {
        id: true, name: true, email: true, role: true, orgId: true, locationId: true,
        org: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      return {
        status: 'ready' as const,
        user: {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          role: existing.role,
          orgId: existing.orgId,
          locationId: existing.locationId,
        },
        orgName: existing.org.name,
      };
    }

    // Pull profile details from Clerk.
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);
    const primaryEmailId = clerkUser.primaryEmailAddressId;
    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === primaryEmailId)?.emailAddress
      ?? clerkUser.emailAddresses[0]?.emailAddress
      ?? '';
    const fullName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim();
    const name = fullName || primaryEmail;

    // Look for a pending invitation matching this email (case-insensitive).
    const normalizedEmail = primaryEmail.trim().toLowerCase();
    const invitation = normalizedEmail
      ? await ctx.db.invitation.findFirst({
          where: {
            status: 'pending',
            email: { equals: normalizedEmail, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (invitation) {
      // Create the user and mark the invitation accepted in a single transaction.
      const { user, org } = await ctx.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            clerkId,
            orgId:      invitation.orgId,
            locationId: invitation.locationId,
            role:       invitation.role,
            name,
            email:      primaryEmail,
          },
          select: {
            id: true, name: true, email: true, role: true, orgId: true, locationId: true,
          },
        });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'accepted', acceptedAt: new Date() },
        });
        const org = await tx.organization.findUnique({
          where: { id: invitation.orgId },
          select: { name: true },
        });
        return { user, org };
      });

      return {
        status: 'invited' as const,
        user,
        orgName: org?.name ?? '',
      };
    }

    // No User row, no invitation — needs to create their own org.
    return {
      status: 'needs_org_setup' as const,
      email: primaryEmail,
      name,
    };
  }),

  // ── users.createOrg ───────────────────────────────────────────────────────
  // Brand-new owner flow: create Organization + first Location + owner User.
  createOrg: publicProcedure
    .input(z.object({
      orgName:         z.string().min(1).max(120),
      locationName:    z.string().min(1).max(120),
      locationAddress: z.string().min(1).max(300),
      timezone:        z.string().default('America/Chicago'),
      taxRatePct:      z.number().min(0).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId: clerkId } = await auth();
      if (!clerkId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
      }

      // Block if a User row already exists for this Clerk session.
      const existing = await ctx.db.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already belong to an organization.',
        });
      }

      // Pull profile details from Clerk.
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkId);
      const primaryEmailId = clerkUser.primaryEmailAddressId;
      const primaryEmail =
        clerkUser.emailAddresses.find((e) => e.id === primaryEmailId)?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress
        ?? '';
      const fullName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim();
      const name = fullName || primaryEmail;

      const taxRateBps = Math.round(input.taxRatePct * 100);

      const result = await ctx.db.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: input.orgName.trim(),
            taxRateBps,
            plan: 'starter',
          },
        });
        const location = await tx.location.create({
          data: {
            orgId:    org.id,
            name:     input.locationName.trim(),
            address:  input.locationAddress.trim(),
            timezone: input.timezone,
          },
        });
        const user = await tx.user.create({
          data: {
            clerkId,
            orgId:      org.id,
            locationId: location.id,
            role:       'owner',
            name,
            email:      primaryEmail,
          },
          select: {
            id: true, name: true, email: true, role: true, orgId: true, locationId: true,
          },
        });
        return { org, location, user };
      });

      return result;
    }),
});
