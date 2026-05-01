import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { clerkClient } from '@clerk/nextjs/server';
import { router, ownerProcedure, managerProcedure } from '../trpc';

const invitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);

export const adminRouter = router({
  // ── Org settings ───────────────────────────────
  getOrg: managerProcedure.query(async ({ ctx }) => {
    return ctx.db.organization.findUnique({
      where: { id: ctx.user.orgId },
      select: { id: true, name: true, plan: true, taxRateBps: true, createdAt: true },
    });
  }),

  updateOrg: ownerProcedure
    .input(z.object({
      name:       z.string().min(1).optional(),
      taxRateBps: z.number().int().min(0).max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({
        where: { id: ctx.user.orgId },
        data: input,
      });
    }),

  // ── Location CRUD ──────────────────────────────
  listLocations: managerProcedure.query(async ({ ctx }) => {
    return ctx.db.location.findMany({
      where: { orgId: ctx.user.orgId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        timezone: true,
        createdAt: true,
        _count: { select: { purchases: true, users: true } },
      },
    });
  }),

  createLocation: ownerProcedure
    .input(z.object({
      name:     z.string().min(1),
      address:  z.string().min(1),
      timezone: z.string().default('America/Chicago'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.location.create({
        data: { orgId: ctx.user.orgId, ...input },
      });
    }),

  updateLocation: ownerProcedure
    .input(z.object({
      id:       z.string().uuid(),
      name:     z.string().min(1).optional(),
      address:  z.string().min(1).optional(),
      timezone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Verify org ownership before mutating
      const existing = await ctx.db.location.findFirst({
        where: { id, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      return ctx.db.location.update({ where: { id }, data });
    }),

  deleteLocation: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Block delete if location has purchases or users assigned
      const blockers = await ctx.db.location.findFirst({
        where: { id: input.id, orgId: ctx.user.orgId },
        select: { _count: { select: { purchases: true, users: true } } },
      });
      if (!blockers) throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      if (blockers._count.purchases > 0 || blockers._count.users > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete: location has ${blockers._count.purchases} purchases and ${blockers._count.users} users assigned`,
        });
      }
      return ctx.db.location.delete({ where: { id: input.id } });
    }),

  // ── User management ────────────────────────────
  listUsers: managerProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { orgId: ctx.user.orgId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        locationId: true,
        createdAt: true,
        pin: true, // included only to compute hasPin; stripped before return
        location: { select: { id: true, name: true } },
      },
    });
    return users.map(({ pin, ...u }) => ({
      ...u,
      hasPin: !!pin,
    }));
  }),

  updateUser: ownerProcedure
    .input(z.object({
      id:         z.string().uuid(),
      name:       z.string().min(1).optional(),
      email:      z.string().email().optional(),
      phone:      z.string().optional(),
      role:       z.enum(['owner', 'manager', 'staff', 'driver']).optional(),
      locationId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Prevent self-demotion: if owner is editing their own role, block downgrade
      if (id === ctx.user.id && data.role && data.role !== 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot demote yourself' });
      }
      // Verify org ownership
      const existing = await ctx.db.user.findFirst({
        where: { id, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return ctx.db.user.update({ where: { id }, data });
    }),

  setUserPin: ownerProcedure
    .input(z.object({
      id:  z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findFirst({
        where: { id: input.id, orgId: ctx.user.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      const hash = await bcrypt.hash(input.pin, 10);
      return ctx.db.user.update({
        where: { id: input.id },
        data: { pin: hash },
        select: { id: true, name: true },
      });
    }),

  removeUser: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself' });
      }
      const existing = await ctx.db.user.findFirst({
        where: { id: input.id, orgId: ctx.user.orgId },
        select: { id: true, _count: { select: { purchases: true, deliveries: true } } },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (existing._count.purchases > 0 || existing._count.deliveries > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove user with purchase or delivery history. Demote to a different role instead.',
        });
      }
      return ctx.db.user.delete({ where: { id: input.id } });
    }),

  // ── Invitations ────────────────────────────────
  inviteUser: managerProcedure
    .input(z.object({
      email:      z.string().email().toLowerCase(),
      role:       z.enum(['manager', 'staff', 'driver']),
      locationId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Validate locationId belongs to this org (if provided).
      if (input.locationId) {
        const loc = await ctx.db.location.findFirst({
          where: { id: input.locationId, orgId: ctx.user.orgId },
          select: { id: true },
        });
        if (!loc) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Location not found in this organization' });
        }
      }

      // 2. Block duplicate pending invitation in this org for this email.
      const existingInvite = await ctx.db.invitation.findFirst({
        where: {
          orgId:  ctx.user.orgId,
          status: 'pending',
          email:  { equals: input.email, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existingInvite) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A pending invitation already exists for this email.',
        });
      }

      // 3. Block if a User with this email already exists in this org.
      const existingUser = await ctx.db.user.findFirst({
        where: {
          orgId: ctx.user.orgId,
          email: { equals: input.email, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A user with this email already exists in this organization.',
        });
      }

      // 4. Compute redirect URL.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
      const redirectUrl = `${appUrl.replace(/\/$/, '')}/onboarding`;

      // 5. Create the Clerk invitation.
      const client = await clerkClient();
      let clerkInvitation;
      try {
        clerkInvitation = await client.invitations.createInvitation({
          emailAddress: input.email,
          redirectUrl,
          publicMetadata: { orgId: ctx.user.orgId, invitedBy: ctx.user.id },
          ignoreExisting: false,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create Clerk invitation';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }

      // 6. Persist our row.
      const invitation = await ctx.db.invitation.create({
        data: {
          orgId:         ctx.user.orgId,
          email:         input.email,
          role:          input.role,
          locationId:    input.locationId ?? null,
          invitedById:   ctx.user.id,
          clerkInviteId: clerkInvitation.id?.toString() ?? null,
        },
      });

      return invitation;
    }),

  listInvitations: managerProcedure
    .input(z.object({ status: invitationStatusSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const status = input?.status ?? 'pending';
      return ctx.db.invitation.findMany({
        where: { orgId: ctx.user.orgId, status },
        orderBy: { createdAt: 'desc' },
        select: {
          id:         true,
          email:      true,
          role:       true,
          status:     true,
          createdAt:  true,
          locationId: true,
          location:   { select: { id: true, name: true } },
          invitedBy:  { select: { id: true, name: true } },
        },
      });
    }),

  revokeInvitation: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findFirst({
        where: { id: input.id, orgId: ctx.user.orgId },
      });
      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }
      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot revoke invitation with status "${invitation.status}"`,
        });
      }

      // Try to revoke in Clerk; ignore errors (it may already be expired/used).
      if (invitation.clerkInviteId) {
        try {
          const client = await clerkClient();
          await client.invitations.revokeInvitation(invitation.clerkInviteId);
        } catch {
          // Best-effort; continue with our local row update.
        }
      }

      await ctx.db.invitation.update({
        where: { id: invitation.id },
        data:  { status: 'revoked' },
      });

      return { ok: true };
    }),
});
