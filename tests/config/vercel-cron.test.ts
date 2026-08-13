import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('Vercel wait-time cron configuration', () => {
  it('uses the supported daily refresh schedule', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toEqual(expect.arrayContaining([
      {
        path: '/api/cron/refresh-wait-times',
        schedule: '0 12 * * *',
      },
    ]));
    expect(config.crons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ schedule: '*/5 * * * *' }),
    ]));
  });
});
