import { afterEach, describe, expect, it, vi } from 'vitest';

describe('back-end server routes', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('starts the server on port 3000 and registers routes', async () => {
    const getMock = vi.fn();
    const listenMock = vi.fn();
    const registerHealthApiMock = vi.fn();
    const registerMoviesApiMock = vi.fn();
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('express', () => ({
      default: vi.fn(() => ({
        get: getMock,
        listen: listenMock,
      })),
    }));
    vi.doMock('./health-api', () => ({
      registerHealthApi: registerHealthApiMock,
    }));
    vi.doMock('./movies-api', () => ({
      registerMoviesApi: registerMoviesApiMock,
    }));

    await import('./index');

    expect(registerHealthApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ get: getMock, listen: listenMock }),
    );
    expect(registerMoviesApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ get: getMock, listen: listenMock }),
    );
    expect(listenMock).toHaveBeenCalledWith(3000, expect.any(Function));

    const listenCallback = listenMock.mock.calls[0]?.[1];
    listenCallback();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Example app in TypeScript listening on port 3000',
    );
  });
});
