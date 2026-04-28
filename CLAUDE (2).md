# TreeLot SaaS — Workspace Rules

## Project overview
TreeLot is a SaaS platform for Christmas tree lot operators. It handles POS checkout,
customer management, delivery dispatch, and sales analytics. Built by Sedulo Digital.

## Tech stack (non-negotiable)
- **Framework**: Next.js 14 App Router + TypeScript
- **Database**: PostgreSQL via Neon (serverless) + Prisma ORM
- **Auth**: Clerk (multi-tenant, role-based)
- **Hosting**: Vercel
- **Styling**: Tailwind CSS
- **API layer**: tRPC with Zod schemas
- **Charts**: Chart.js
- **Email**: Resend
- **SMS** (Phase 2): Twilio

## Color palette (brand)
These are non-negotiable. Use them via Tailwind custom colors or CSS variables.
- Dark green (primary bg): #1c2b1a
- Forest (sidebar): #243322
- Green (active/selected): #3B6D11
- Mid green: #639922
- Light green: #97C459
- Pale green (hover fills): #EAF3DE
- Mint (text on dark): #C0DD97
- Teal (secondary text): #5DCAA5
- Off-white (page bg): #f5f4f0
- Border: #d3d1c7

## User roles (Clerk)
- `owner` — full access, billing, all locations
- `manager` — ops access, no billing
- `staff` — POS only
- `driver` — driver app only (separate route)

## Communication style
- Plain English, no jargon
- Business impact first
- No unnecessary complexity
- When in doubt, build the simpler version first

## Code style
- Prefer server components where possible
- All DB queries go through tRPC routers, never direct from components
- All money stored as integers (cents), never floats
- Tax rate: 8.25% (Texas). Stored as `825` basis points.
- UUIDs for all primary keys
- Timestamps in UTC, display in America/Chicago
- Zod schemas defined once, shared between client and server

## File structure
Follow the Sedulo Digital Merchant Deployment SOP v1.0 pattern:
```
/app
  /(auth)          — Clerk auth pages
  /(dashboard)     — main app (owner/manager/staff)
    /pos           — POS checkout
    /deliveries    — dispatcher
    /customers     — customer database
    /analytics     — analytics tab
    /sales         — sales command center
    /settings      — org settings
  /driver          — standalone driver PWA (no sidebar, PIN login)
/server
  /routers         — tRPC routers (one per domain)
/prisma
  schema.prisma
```

## What NOT to do
- Never use float for money
- Never query the DB directly from a component
- Never store sensitive data in client state
- Never use `any` in TypeScript
- Never use localStorage in the driver app (use server state)
- Do not install UI component libraries (shadcn, MUI, etc.) — build to spec

## Visual reference
The HTML mockups in /mockups/ are the design spec. Match them closely.
Pixel-perfect is not required but layout, color, and interaction patterns must match.

## Current build phase
MVP — Phase 1. See PRD for feature scope.
