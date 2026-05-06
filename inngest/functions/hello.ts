import { inngest } from '@/lib/inngest';

export const hello = inngest.createFunction(
  {
    id: 'test-hello',
    triggers: [{ event: 'treelot/test.hello' }],
  },
  async ({ event, step }) =>
    step.run('log', () => ({
      ok: true,
      message: (event.data as { message?: string }).message ?? null,
      receivedAt: new Date().toISOString(),
    })),
);
