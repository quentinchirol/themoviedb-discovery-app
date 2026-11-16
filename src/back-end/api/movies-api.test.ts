import type { Express, Request, RequestHandler, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_PAGE,
  DEFAULT_REGION,
} from '../utils/constants';
import { tmdbAccessToken } from '../utils/config';
import * as movieQueryParams from '../utils/movie-query-params';
import { registerMoviesApi } from './movies-api';
import type {
  TmdbMovieDetails,
  TmdbMoviesRawResponse,
} from '../types/MoviesTypes';

const { toSupportedMovieMock, toSupportedMovieDetailsMock } = vi.hoisted(
  () => ({
    toSupportedMovieMock: vi.fn(),
    toSupportedMovieDetailsMock: vi.fn(),
  }),
);

vi.mock('../utils/converter', () => ({
  toSupportedMovie: toSupportedMovieMock,
  toSupportedMovieDetails: toSupportedMovieDetailsMock,
}));

vi.mock('../utils/config', () => ({
  tmdbAccessToken: 'test-access-token',
}));

type RouteHandler = (
  req: Request,
  res: Response,
  next: (error?: unknown) => void,
) => void | Promise<void>;

const handlers = new Map<string, RequestHandler>();
const app = {
  get: (path: string, handler: RequestHandler) => handlers.set(path, handler),
} as unknown as Express;

function getHandler(path: string): RouteHandler {
  const handler = handlers.get(path);
  if (!handler) throw new Error(`No handler registered for ${path}`);
  return handler as RouteHandler;
}

function createResponse() {
  const response = { json: vi.fn(), status: vi.fn() };
  response.status.mockReturnValue(response);
  return response as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

function tmdbResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe('movies API', () => {
  beforeEach(() => {
    handlers.clear();
    registerMoviesApi(app);
    toSupportedMovieMock.mockReset();
    toSupportedMovieDetailsMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('GET /api/movies/popular', () => {
    it('returns popular movies', async () => {
      // Arrange
      const rawMovie = { id: 1 };
      const rawData = {
        page: 1,
        results: [rawMovie],
        total_pages: 2,
        total_results: 1,
      } as unknown as TmdbMoviesRawResponse;
      const supportedMovie = { id: 1, title: 'Movie' };
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      toSupportedMovieMock.mockReturnValue(supportedMovie);
      const response = createResponse();
      const createMovieQueryParamsSpy = vi.spyOn(
        movieQueryParams,
        'createMovieQueryParams',
      );

      // Act
      await getHandler('/api/movies/popular')(
        { query: {} } as Request,
        response,
        vi.fn(),
      );

      // Assert
      // Assert that the createMovieQueryParams function was called with the correct query parameters
      expect(createMovieQueryParamsSpy).toHaveBeenCalledWith({});

      // Assert that the fetch function was called with the correct URL and headers
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.themoviedb.org/3/movie/popular?language=${DEFAULT_LANGUAGE}&page=${DEFAULT_PAGE}&region=${DEFAULT_REGION}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );

      // Assert that the response contains the transformed movie data
      expect(response.json).toHaveBeenCalledWith({
        page: DEFAULT_PAGE,
        results: [supportedMovie],
        total_pages: 2,
        total_results: 1,
      });
    });

    it('returns errors for unsuccessful and rejected popular movie requests', async () => {
      // Arrange
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tmdbResponse({}, false, 503))
        .mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);
      const unsuccessfulResponse = createResponse();
      const rejectedResponse = createResponse();

      // Act
      await getHandler('/api/movies/popular')(
        { query: {} } as Request,
        unsuccessfulResponse,
        vi.fn(),
      );
      await getHandler('/api/movies/popular')(
        { query: {} } as Request,
        rejectedResponse,
        vi.fn(),
      );

      // Assert
      for (const response of [unsuccessfulResponse, rejectedResponse]) {
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({
          error: 'Failed to fetch popular movies',
        });
      }
    });
  });

  describe('GET /api/discover/movies', () => {
    it('returns discovered movies with the default query parameters', async () => {
      const rawData = {
        page: 1,
        results: [{ id: 1 }, { id: 2 }],
        total_pages: 3,
        total_results: 2,
      } as unknown as TmdbMoviesRawResponse;
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      const response = createResponse();
      const supportedMovie = { id: 1, title: 'Movie' };
      toSupportedMovieMock.mockReturnValue(supportedMovie);

      await getHandler('/api/discover/movies')(
        { query: { year: '2020' } } as unknown as Request,
        response,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.themoviedb.org/3/discover/movie?primary_release_year=2020&language=${DEFAULT_LANGUAGE}&page=${DEFAULT_PAGE}&region=${DEFAULT_REGION}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );
      expect(response.json).toHaveBeenCalledWith({
        page: 1,
        results: [supportedMovie, supportedMovie],
        total_pages: 3,
        total_results: 2,
      });
    });

    it('uses the custom discover query parameters when provided', async () => {
      const rawData = {
        page: 2,
        results: [{ id: 42 }],
        total_pages: 5,
        total_results: 10,
      } as unknown as TmdbMoviesRawResponse;
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      const response = createResponse();
      const supportedMovie = { id: 42, title: 'Movie' };
      toSupportedMovieMock.mockReturnValue(supportedMovie);

      await getHandler('/api/discover/movies')(
        {
          query: {
            year: '2023',
            language: 'en-US',
            page: '2',
            region: 'US',
          },
        } as unknown as Request,
        response,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/discover/movie?primary_release_year=2023&language=en-US&page=2&region=US',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );
      expect(response.json).toHaveBeenCalledWith({
        page: 2,
        results: [supportedMovie],
        total_pages: 5,
        total_results: 10,
      });
    });

    it('returns an empty result set with TMDB pagination when no movies match', async () => {
      const rawData = {
        page: 1,
        results: [],
        total_pages: 0,
        total_results: 0,
      } as unknown as TmdbMoviesRawResponse;
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      const response = createResponse();

      await getHandler('/api/discover/movies')(
        { query: { year: '2021' } } as unknown as Request,
        response,
        vi.fn(),
      );

      expect(response.json).toHaveBeenCalledWith({
        page: 1,
        results: [],
        total_pages: 0,
        total_results: 0,
      });
    });

    it('rejects missing or invalid years without calling TMDB', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const invalidResponse = createResponse();
      const missingResponse = createResponse();
      const outOfRangeResponse = createResponse();

      await getHandler('/api/discover/movies')(
        { query: { year: 'abcd' } } as unknown as Request,
        invalidResponse,
        vi.fn(),
      );
      await getHandler('/api/discover/movies')(
        { query: {} } as unknown as Request,
        missingResponse,
        vi.fn(),
      );
      await getHandler('/api/discover/movies')(
        { query: { year: '0999' } } as unknown as Request,
        outOfRangeResponse,
        vi.fn(),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(invalidResponse.status).toHaveBeenCalledWith(400);
      expect(invalidResponse.json).toHaveBeenCalledWith({
        error:
          'Year is required and must be a 4-digit number between 1000 and 9999.',
      });
      expect(missingResponse.status).toHaveBeenCalledWith(400);
      expect(missingResponse.json).toHaveBeenCalledWith({
        error:
          'Year is required and must be a 4-digit number between 1000 and 9999.',
      });
      expect(outOfRangeResponse.status).toHaveBeenCalledWith(400);
      expect(outOfRangeResponse.json).toHaveBeenCalledWith({
        error:
          'Year is required and must be a 4-digit number between 1000 and 9999.',
      });
    });

    it('accepts a year supplied as an array item and calls TMDB with it', async () => {
      const rawData = {
        page: 1,
        results: [{ id: 9 }],
        total_pages: 1,
        total_results: 1,
      } as unknown as TmdbMoviesRawResponse;
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      const response = createResponse();
      const supportedMovie = { id: 9, title: 'Array Year Movie' };
      toSupportedMovieMock.mockReturnValue(supportedMovie);

      await getHandler('/api/discover/movies')(
        { query: { year: ['2021'] } } as unknown as Request,
        response,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.themoviedb.org/3/discover/movie?primary_release_year=2021&language=${DEFAULT_LANGUAGE}&page=${DEFAULT_PAGE}&region=${DEFAULT_REGION}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );
      expect(response.json).toHaveBeenCalledWith({
        page: 1,
        results: [supportedMovie],
        total_pages: 1,
        total_results: 1,
      });
    });

    it('falls back to defaults when optional query params are blank or non-string values', async () => {
      const rawData = {
        page: 1,
        results: [{ id: 7 }],
        total_pages: 1,
        total_results: 1,
      } as unknown as TmdbMoviesRawResponse;
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      const response = createResponse();
      const supportedMovie = { id: 7, title: 'Fallback Movie' };
      toSupportedMovieMock.mockReturnValue(supportedMovie);

      await getHandler('/api/discover/movies')(
        {
          query: {
            year: '2024',
            language: 42,
            page: ['   '],
            region: ['    '],
          },
        } as unknown as Request,
        response,
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.themoviedb.org/3/discover/movie?primary_release_year=2024&language=${DEFAULT_LANGUAGE}&page=${DEFAULT_PAGE}&region=${DEFAULT_REGION}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );
      expect(response.json).toHaveBeenCalledWith({
        page: 1,
        results: [supportedMovie],
        total_pages: 1,
        total_results: 1,
      });
    });

    it('returns errors for unsuccessful, rejected, and JSON parsing failures', async () => {
      const unsuccessfulResponse = createResponse();
      const rejectedResponse = createResponse();
      const jsonErrorResponse = createResponse();

      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(tmdbResponse({}, false, 500))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockRejectedValueOnce(new Error('JSON error')),
          }),
      );

      await getHandler('/api/discover/movies')(
        { query: { year: '2020' } } as unknown as Request,
        unsuccessfulResponse,
        vi.fn(),
      );
      await getHandler('/api/discover/movies')(
        { query: { year: '2020' } } as unknown as Request,
        rejectedResponse,
        vi.fn(),
      );
      await getHandler('/api/discover/movies')(
        { query: { year: '2020' } } as unknown as Request,
        jsonErrorResponse,
        vi.fn(),
      );

      for (const response of [
        unsuccessfulResponse,
        rejectedResponse,
        jsonErrorResponse,
      ]) {
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({
          error: 'Failed to discover movies',
        });
      }
    });
  });

  describe('GET /api/movies/:id', () => {
    it('returns movie details', async () => {
      // Arrange
      const rawData = { id: 42 } as unknown as TmdbMovieDetails;
      const supportedDetails = { id: 42, title: 'Movie details' };
      const fetchMock = vi.fn().mockResolvedValueOnce(tmdbResponse(rawData));
      vi.stubGlobal('fetch', fetchMock);
      toSupportedMovieDetailsMock.mockReturnValue(supportedDetails);
      const response = createResponse();

      // Act
      await getHandler('/api/movies/:id')(
        { params: { id: '42' }, query: {} } as unknown as Request,
        response,
        vi.fn(),
      );

      // Assert
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.themoviedb.org/3/movie/42?language=${DEFAULT_LANGUAGE}&page=${DEFAULT_PAGE}&region=${DEFAULT_REGION}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${tmdbAccessToken}`,
          }),
        }),
      );
      expect(toSupportedMovieDetailsMock).toHaveBeenCalledWith(rawData);
      expect(response.json).toHaveBeenCalledWith(supportedDetails);
    });

    it('returns errors for unsuccessful and rejected movie detail requests', async () => {
      // Arrange
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tmdbResponse({}, false, 404))
        .mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);
      const unsuccessfulResponse = createResponse();
      const rejectedResponse = createResponse();

      // Act
      await getHandler('/api/movies/:id')(
        { params: { id: '42' }, query: {} } as unknown as Request,
        unsuccessfulResponse,
        vi.fn(),
      );
      await getHandler('/api/movies/:id')(
        { params: { id: '42' }, query: {} } as unknown as Request,
        rejectedResponse,
        vi.fn(),
      );

      // Assert
      for (const response of [unsuccessfulResponse, rejectedResponse]) {
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({
          error: 'Failed to fetch movie with ID 42',
        });
      }
    });
  });
});
