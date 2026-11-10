import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { parseCountriesCsv } from './database/country-csv.ts';
import {
  cleanUnusedCountries,
  upsertCountries,
} from './database/country-repository.ts';
import { openMoviesDatabase } from './database/schema.ts';

const defaultDatabasePath = 'data/database.sqlite';

export function initializeDatabase(path: string): string {
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);
  database.close();

  return databasePath;
}

export function importCountries(
  csvFile: string,
  path: string,
): { databasePath: string; countryCount: number } {
  const countries = parseCountriesCsv(readFileSync(csvFile, 'utf8'));
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);

  try {
    upsertCountries(database, countries);
    return {
      databasePath,
      countryCount: new Set(countries.map((country) => country.code)).size,
    };
  } finally {
    database.close();
  }
}

export function removeUnusedCountries(path: string): {
  databasePath: string;
  countryCount: number;
} {
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);

  try {
    return { databasePath, countryCount: cleanUnusedCountries(database) };
  } finally {
    database.close();
  }
}

const program = new Command();

program
  .name('backend-cli')
  .description('Manage the SQLite movie database.')
  .option('-p, --path <path>', 'SQLite database file path', defaultDatabasePath)
  .action(() => {
    const { path } = program.opts<{ path: string }>();
    const databasePath = initializeDatabase(path);
    console.log(`Database initialized at ${databasePath}`);
  });

program
  .command('add-countries')
  .description('Import or update countries from a CSV file.')
  .argument('<csv-file>', 'CSV file containing code and name columns')
  .action((csvFile: string) => {
    const { path } = program.opts<{ path: string }>();
    const result = importCountries(csvFile, path);
    console.log(
      `Imported ${result.countryCount} ${result.countryCount === 1 ? 'country' : 'countries'} into ${result.databasePath}`,
    );
  });

program
  .command('clean-countries')
  .description('Remove countries not associated with a movie.')
  .action(() => {
    const { path } = program.opts<{ path: string }>();
    const result = removeUnusedCountries(path);
    console.log(
      `Removed ${result.countryCount} unused ${result.countryCount === 1 ? 'country' : 'countries'} from ${result.databasePath}`,
    );
  });

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  program.parse(process.argv);
}
