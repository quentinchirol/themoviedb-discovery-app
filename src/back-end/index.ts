import express from 'express';
import { tmdbAccessToken } from './config';
import { toSupportedMovie } from './utils';
import type {
  MoviesApiResponse,
  TmdbMoviesRawResponse,
} from './schemas/MoviesTypes';
import { DEFAULT_LANGUAGE, DEFAULT_PAGE, DEFAULT_REGION } from './constants';

// Create a new express application instance
const app = express();
// Define the port number for the server to listen on
const port: number = 3000;
// Define a route handler for the root URL ('/')
app.get('/', (_req: express.Request, res: express.Response) => {
  res.send('Hello World from TypeScript!');
});
// Start the server and listen on the specified port
app.listen(port, () => {
  console.log(`Example app in TypeScript listening on port ${port}`);
});

// Define a route handler for fetching popular movies from TMDB API
app.get(
  '/api/movies/popular',
  async (_req: express.Request, res: express.Response) => {
    try {
        // Create a URLSearchParams object to build the query string for the TMDB API request
      const queryParams = new URLSearchParams();

      // Extract query parameters from the request and append them to the query string
      const { language, page, region } = _req.query;

      queryParams.append('language', (language as string) || DEFAULT_LANGUAGE);
      queryParams.append('page', (page as string) || DEFAULT_PAGE);
      queryParams.append('region', (region as string) || DEFAULT_REGION);

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
      const rawData = (await response.json()) as TmdbMoviesRawResponse;

      const data: MoviesApiResponse = {
        page: rawData.page,
        results: rawData.results.map(toSupportedMovie),
        total_pages: rawData.total_pages,
        total_results: rawData.total_results,
      };

      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to fetch popular movies' });
    }
  },
);
