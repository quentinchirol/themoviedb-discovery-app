import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import { DEFAULT_LANGUAGE, DEFAULT_REGION } from '../utils/constants.ts';
import { upsertMovie, type MovieForStorage } from './schema.ts';

type TmdbDiscoverResponse = {
  results: Array<{ id: number }>;
  total_pages: number;
};

type TmdbMovieDetailsForStorage = {
  id: number;
  title: string;
  original_title: string;
  release_date?: string | null;
  overview?: string | null;
  original_language?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  runtime?: number | null;
  budget?: number | null;
  revenue?: number | null;
  genres: MovieForStorage['genres'];
  production_countries: Array<{ iso_3166_1: string; name: string }>;
};

type SyncMoviesOptions = {
  database: DatabaseSync;
  year: string;
  accessToken: string;
  csvPath?: string;
  maxPages?: number;
  language?: string;
  region?: string;
  fetcher?: typeof fetch;
};

const moviesCsvHeader = [
  'id',
  'title',
  'original_title',
  'original_language',
  'overview',
  'release_date',
  'popularity',
  'vote_average',
  'vote_count',
  'poster_path',
  'backdrop_path',
  'runtime',
  'budget',
  'revenue',
  'genres',
  'production_countries',
];

function nullablePositiveNumber(value: number | null | undefined) {
  return value && value > 0 ? value : null;
}

function toMovieForStorage(
  details: TmdbMovieDetailsForStorage,
): MovieForStorage {
  return {
    id: details.id,
    title: details.title,
    originalTitle: details.original_title,
    releaseDate: details.release_date || null,
    overview: details.overview || null,
    originalLanguage: details.original_language || null,
    posterPath: details.poster_path || null,
    backdropPath: details.backdrop_path || null,
    popularity: nullablePositiveNumber(details.popularity),
    voteAverage: details.vote_average ?? null,
    voteCount: nullablePositiveNumber(details.vote_count),
    runtime: nullablePositiveNumber(details.runtime),
    budget: nullablePositiveNumber(details.budget),
    revenue: nullablePositiveNumber(details.revenue),
    genres: details.genres,
    productionCountries: details.production_countries.map((country) => ({
      code: country.iso_3166_1,
      name: country.name,
    })),
  };
}

function csvValue(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(movies: MovieForStorage[]): string {
  const lines = movies.map((movie) =>
    [
      movie.id,
      movie.title,
      movie.originalTitle,
      movie.originalLanguage,
      movie.overview,
      movie.releaseDate,
      movie.popularity,
      movie.voteAverage,
      movie.voteCount,
      movie.posterPath,
      movie.backdropPath,
      movie.runtime,
      movie.budget,
      movie.revenue,
      JSON.stringify(movie.genres.map((genre) => genre.id)),
      JSON.stringify(
        movie.productionCountries.map((country) => ({
          iso_3166_1: country.code,
          name: country.name,
        })),
      ),
    ]
      .map(csvValue)
      .join(','),
  );

  return [moviesCsvHeader.join(','), ...lines].join('\n') + '\n';
}

async function fetchJson<T>(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json;charset=utf-8',
    },
  });
  if (!response.ok) {
    throw new Error(`TMDB API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function syncMoviesFromDiscover({
  database,
  year,
  accessToken,
  csvPath = 'data/movies.csv',
  maxPages = 1,
  language = DEFAULT_LANGUAGE,
  region = DEFAULT_REGION,
  fetcher = fetch,
}: SyncMoviesOptions): Promise<number> {
  if (!/^\d{4}$/.test(year) || Number(year) < 1000 || Number(year) > 9999) {
    throw new Error('Year must be a 4-digit number between 1000 and 9999.');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages must be a positive integer.');
  }

  const resolvedCsvPath = resolve(csvPath);
  const movieIds = new Set<number>();
  if (existsSync(resolvedCsvPath)) {
    const existingRows = parse(readFileSync(resolvedCsvPath), {
      columns: true,
      skip_empty_lines: true,
    }) as Array<{ id: string }>;
    for (const row of existingRows) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) movieIds.add(id);
    }
  }

  let totalPages = 1;
  let page = 1;
  while (page <= maxPages && page <= totalPages) {
    const query = new URLSearchParams({
      primary_release_year: year,
      language,
      page: String(page),
      region,
    });
    const discoverData = await fetchJson<TmdbDiscoverResponse>(
      `https://api.themoviedb.org/3/discover/movie?${query.toString()}`,
      accessToken,
      fetcher,
    );

    totalPages = discoverData.total_pages;
    for (const movie of discoverData.results) movieIds.add(movie.id);
    page += 1;
  }

  const movies: MovieForStorage[] = [];
  for (const id of movieIds) {
    const query = new URLSearchParams({ language });
    const details = await fetchJson<TmdbMovieDetailsForStorage>(
      `https://api.themoviedb.org/3/movie/${id}?${query.toString()}`,
      accessToken,
      fetcher,
    );
    movies.push(toMovieForStorage(details));
  }

  const temporaryCsvPath = `${resolvedCsvPath}.tmp`;
  mkdirSync(dirname(resolvedCsvPath), { recursive: true });
  writeFileSync(temporaryCsvPath, toCsv(movies), 'utf8');
  try {
    for (const movie of movies) upsertMovie(database, movie);
    renameSync(temporaryCsvPath, resolvedCsvPath);
  } catch (error) {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(temporaryCsvPath);
    } catch {
      // The temporary file may already have been renamed or removed.
    }
    throw error;
  }

  return movies.length;
}
