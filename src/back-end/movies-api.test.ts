import type { Express, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMoviesApi } from './movies-api';
import type { TmdbMoviesRawResponse } from './schemas/MoviesTypes';

describe('movies API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers GET /api/movies/popular and returns popular movies', async () => {
    const getMock = vi.fn();
    const app = { get: getMock } as unknown as Express;

    registerMoviesApi(app);

    expect(getMock).toHaveBeenCalledOnce();
    expect(getMock).toHaveBeenCalledWith(
      '/api/movies/popular',
      expect.any(Function),
    );

    const handler = getMock.mock.calls[0]?.[1] as (
      req: Request,
      res: Response,
    ) => Promise<void>;
    const rawData: TmdbMoviesRawResponse = {
      page: 2,
      results: [
        {
          adult: false,
          backdrop_path: '/backdrop.jpg',
          genre_ids: [18],
          id: 123,
          original_language: 'en',
          original_title: 'Original title',
          overview: 'A movie overview',
          popularity: 12.5,
          poster_path: '/poster.jpg',
          release_date: '2024-01-01',
          title: 'Movie title',
          video: false,
          vote_average: 7.5,
          vote_count: 10,
        },
      ],
      total_pages: 3,
      total_results: 25,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(rawData),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = {
      json: vi.fn(),
      status: vi.fn(),
    } as unknown as Response;
    vi.mocked(response.status).mockReturnValue(response);

    await handler(
      {
        query: { language: 'en-US', page: '2', region: 'US' },
      } as unknown as Request,
      response,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/movie/popular?language=en-US&page=2&region=US',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(response.json).toHaveBeenCalledWith({
      page: 2,
      results: [
        {
          backdrop_path: '/backdrop.jpg',
          genre_ids: [18],
          id: 123,
          original_language: 'en',
          original_title: 'Original title',
          overview: 'A movie overview',
          popularity: 12.5,
          poster_path: '/poster.jpg',
          release_date: '2024-01-01',
          title: 'Movie title',
          vote_average: 7.5,
          vote_count: 10,
        },
      ],
      total_pages: 3,
      total_results: 25,
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns a 500 response when TMDB returns an error', async () => {
    const getMock = vi.fn();
    const app = { get: getMock } as unknown as Express;
    registerMoviesApi(app);

    const handler = getMock.mock.calls[0]?.[1] as (
      req: Request,
      res: Response,
    ) => Promise<void>;
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const response = {
      json: vi.fn(),
      status: vi.fn(),
    } as unknown as Response;
    vi.mocked(response.status).mockReturnValue(response);

    await handler({ query: {} } as Request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Failed to fetch popular movies',
    });
  });
});
