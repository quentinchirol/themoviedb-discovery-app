import { describe, expect, it } from 'vitest';

import { toSupportedMovie } from './utils';
import type { TmdbMoviesRawResponse } from './schemas/MoviesTypes';

describe('toSupportedMovie', () => {
  it('maps a raw TMDB movie to the supported application format', () => {
    const rawMovie: TmdbMoviesRawResponse['results'][number] = {
      adult: false,
      backdrop_path: '/backdrop.jpg',
      genre_ids: [28, 12],
      id: 42,
      original_language: 'en',
      original_title: 'Original Title',
      overview: 'A sample overview',
      popularity: 99.5,
      poster_path: '/poster.jpg',
      release_date: '2024-12-01',
      title: 'My Movie',
      video: false,
      vote_average: 8.7,
      vote_count: 1542,
    };

    expect(toSupportedMovie(rawMovie)).toEqual({
      backdrop_path: '/backdrop.jpg',
      genre_ids: [28, 12],
      id: 42,
      original_language: 'en',
      original_title: 'Original Title',
      overview: 'A sample overview',
      popularity: 99.5,
      poster_path: '/poster.jpg',
      release_date: '2024-12-01',
      title: 'My Movie',
      vote_average: 8.7,
      vote_count: 1542,
    });
  });
});
