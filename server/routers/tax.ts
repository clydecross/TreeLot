import { z } from 'zod';
import Taxjar from 'taxjar';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';

// Lazy-init the TaxJar client. Returns null if no API key is set, in which
// case lookupRate fails gracefully and the onboarding form falls back to
// manual tax-rate entry (no error is shown to the user — it just won't
// auto-fill).
let _client: Taxjar | null = null;
function getClient(): Taxjar | null {
  const key = process.env.TAXJAR_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Taxjar({ apiKey: key });
  return _client;
}

export const taxRouter = router({
  // ── tax.lookupRate ────────────────────────────────────────────────────────
  // Looks up combined US sales tax (state + county + city + districts) for a
  // given ZIP. Used by the onboarding form to auto-fill the tax rate field
  // when the owner enters their lot's address.
  //
  // Public procedure — runs during onboarding before the User row exists.
  // Caller must already have a Clerk session to even reach the onboarding
  // page (proxy.ts protects /onboarding), so abuse risk is low.
  lookupRate: publicProcedure
    .input(
      z.object({
        zip:   z.string().regex(/^\d{5}$/, 'ZIP must be exactly 5 digits'),
        city:  z.string().optional(),
        state: z.string().length(2).optional(),
      })
    )
    .query(async ({ input }) => {
      const client = getClient();
      if (!client) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Tax lookup is not configured on this server.',
        });
      }

      try {
        // TaxJar's optional params are validated as a group — passing partial
        // params (e.g. country only) trips a "state must be ISO code" error.
        // Only pass the params object if we have a complete city+state pair.
        const result =
          input.city && input.state
            ? await client.ratesForLocation(input.zip, {
                city:    input.city,
                state:   input.state,
                country: 'US',
              })
            : await client.ratesForLocation(input.zip);
        const rate = result.rate as Record<string, string | number | boolean | undefined>;

        const num = (v: unknown): number => {
          if (typeof v === 'number') return v;
          if (typeof v === 'string' && v.length > 0) return parseFloat(v) || 0;
          return 0;
        };

        const combinedRatePct = num(rate.combined_rate) * 100;

        return {
          combinedRatePct,
          combinedRateBps: Math.round(combinedRatePct * 100),
          breakdown: {
            statePct:    num(rate.state_rate) * 100,
            countyPct:   num(rate.county_rate) * 100,
            cityPct:     num(rate.city_rate) * 100,
            districtPct: num(rate.combined_district_rate) * 100,
          },
          locationDescription: [rate.city, rate.county, rate.state]
            .filter(Boolean)
            .join(', '),
          zip: input.zip,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Tax lookup failed';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Could not look up tax rate: ${msg}`,
        });
      }
    }),
});
