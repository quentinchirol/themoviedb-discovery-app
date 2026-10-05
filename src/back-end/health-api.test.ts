import type { Express, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { registerHealthApi } from './health-api';

describe('health API', () => {
  it('registers GET /api/health and returns ok status', () => {
    const getMock = vi.fn();
    const app = { get: getMock } as unknown as Express;

    registerHealthApi(app);

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/api/health', expect.any(Function));

    const handler = getMock.mock.calls[0]?.[1] as (
      req: Request,
      res: Response,
    ) => void;
    const response = { json: vi.fn() } as unknown as Response;

    handler({} as Request, response);

    expect(response.json).toHaveBeenCalledWith({ status: 'ok' });
  });
});
