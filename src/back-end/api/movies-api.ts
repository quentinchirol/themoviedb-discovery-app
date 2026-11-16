import type { Express } from 'express';
import express from 'express';
import { createMovieQueryParams } from '../utils/movie-query-params';
import { toSupportedMovie, toSupportedMovieDetails } from '../utils/converter';
import { tmdbAccessToken } from '../utils/config';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_PAGE,
  DEFAULT_REGION,
} from '../utils/constants';
import type {
  MovieDetails,
  MoviesApiResponse,
  TmdbMovieDetails,
  TmdbMoviesRawResponse,
} from '../types/MoviesTypes';

export { createMovieQueryParams } from '../utils/movie-query-params';

function parseStringQueryValue(value: unknown, defaultValue: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return defaultValue;
  return candidate.trim() === '' ? defaultValue : candidate;
}

function parseYear(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !/^\d{4}$/.test(candidate)) {
    return undefined;
  }

  const year = Number(candidate);
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    return undefined;
  }

  return candidate;
}

/**
 * Registers the movies API routes (popular movies and movie details) on the given Express application instance.
 * @param app - The Express application instance to register the movies API routes on.
 */
export function registerMoviesApi(app: Express): void {
  app.get('/api/discover/movies', async (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) {
      res.status(400).json({
        error:
          'Year is required and must be a 4-digit number between 1000 and 9999.',
      });
      return;
    }

    const queryParams = new URLSearchParams({
      primary_release_year: year,
      language: parseStringQueryValue(req.query.language, DEFAULT_LANGUAGE),
      page: parseStringQueryValue(req.query.page, String(DEFAULT_PAGE)),
      region: parseStringQueryValue(req.query.region, DEFAULT_REGION),
    });

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/discover/movie?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${tmdbAccessToken}`,
            'Content-Type': 'application/json;charset=utf-8',
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `TMDB API request failed with status ${response.status}`,
        );
      }

      const rawData = (await response.json()) as TmdbMoviesRawResponse;
      const data: MoviesApiResponse = {
        page: rawData.page,
        results: rawData.results.map(toSupportedMovie),
        total_pages: rawData.total_pages,
        total_results: rawData.total_results,
      };

      res.json(data);
    } catch (error) {
      console.error('Error discovering movies:', error);
      res.status(500).json({ error: 'Failed to discover movies' });
    }
  });

  // Define a route handler for fetching popular movies from TMDB API
  app.get(
    '/api/movies/popular',
    async (_req: express.Request, res: express.Response) => {
      try {
        // Create the query parameters for the TMDB API request
        const queryParams = createMovieQueryParams(_req.query);

        // log the query parameters for debugging purposes
        console.log('Query Params:', queryParams.toString());

        const response = await fetch(
          `https://api.themoviedb.org/3/movie/popular?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${tmdbAccessToken}`,
              'Content-Type': 'application/json;charset=utf-8',
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `TMDB API request failed with status ${response.status}`,
          );
        }

        // Parse the raw response from the TMDB API
        const rawData = (await response.json()) as TmdbMoviesRawResponse;

        // Transform the raw data into the supported format for our application
        const data: MoviesApiResponse = {
          page: rawData.page,
          results: rawData.results.map(toSupportedMovie),
          total_pages: rawData.total_pages,
          total_results: rawData.total_results,
        };

        res.json(data);
      } catch (error) {
        console.error('Error fetching popular movies:', error);
        res.status(500).json({ error: 'Failed to fetch popular movies' });
      }
    },
  );

  // Define a route handler for fetching movie details by ID from TMDB API
  app.get(
    '/api/movies/:id',
    async (_req: express.Request, res: express.Response) => {
      // Extract the movie ID from the request parameters
      const movieId = _req.params.id;

      // Create the query parameters for the TMDB API request
      const queryParams = createMovieQueryParams(_req.query);

      // log the query parameters for debugging purposes
      console.log('Query Params:', queryParams.toString());

      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${movieId}?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${tmdbAccessToken}`,
              'Content-Type': 'application/json;charset=utf-8',
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `TMDB API request failed with status ${response.status}`,
          );
        }

        // Parse the raw response from the TMDB API
        const rawData = (await response.json()) as TmdbMovieDetails;

        // Transform the raw data into the supported format for our application
        const data: MovieDetails = toSupportedMovieDetails(rawData);

        // Send the transformed data as a JSON response
        res.json(data);
      } catch (error) {
        console.error(`Error fetching movie with ID ${movieId}:`, error);
        res
          .status(500)
          .json({ error: `Failed to fetch movie with ID ${movieId}` });
      }
    },
  );
}
