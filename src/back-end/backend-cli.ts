import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { openMoviesDatabase } from './database/schema.ts';
import { parseGenresCsv } from './database/genre-csv-parser.ts';
import {
  cleanUnusedGenres,
  upsertGenres,
} from './database/genre-repository.ts';

const defaultDatabasePath = 'data/database.sqlite';

export function initializeDatabase(path: string): string {
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);
  database.close();

  return databasePath;
}

export function addGenresFromCsv(
  csvPath: string,
  path = defaultDatabasePath,
): { importedCount: number; databasePath: string } {
  const genres = parseGenresCsv(readFileSync(csvPath, 'utf8'));
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);

  try {
    upsertGenres(database, genres);
    return {
      importedCount: new Set(genres.map((genre) => genre.id)).size,
      databasePath,
    };
  } finally {
    database.close();
  }
}

export function cleanGenresFromDatabase(path = defaultDatabasePath): {
  deletedCount: number;
  databasePath: string;
} {
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);

  try {
    return {
      deletedCount: cleanUnusedGenres(database),
      databasePath,
    };
  } finally {
    database.close();
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('backend-cli')
    .description('Initialize and manage the SQLite movie database.')
    .option(
      '-p, --path <path>',
      'SQLite database file path',
      defaultDatabasePath,
    )
    .command('add-genres <csv-file>')
    .description('Import or update genres from a CSV file.')
    .action((csvPath: string) => {
      const { path } = program.opts<{ path: string }>();
      const { importedCount, databasePath } = addGenresFromCsv(csvPath, path);
      console.log(`Imported ${importedCount} genres into ${databasePath}`);
    });

  program
    .command('clean-genres')
    .description('Delete genres that are not associated with any movie.')
    .action(() => {
      const { path } = program.opts<{ path: string }>();
      const { deletedCount, databasePath } = cleanGenresFromDatabase(path);
      console.log(`Removed ${deletedCount} unused genres from ${databasePath}`);
    });

  program.action(() => {
    const { path } = program.opts<{ path: string }>();
    const databasePath = initializeDatabase(path);
    console.log(`Database initialized at ${databasePath}`);
  });

  return program;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  createProgram().parse(process.argv);
}
