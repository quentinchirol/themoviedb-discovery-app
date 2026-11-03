import { parse } from 'csv-parse/sync';
import type { Genre } from './genre-repository';

function isCsvRecord(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((field) => typeof field === 'string')
  );
}

export function parseGenresCsv(contents: string): Genre[] {
  let records: unknown;
  try {
    records = parse(contents, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    });
  } catch (error) {
    throw new Error(
      `Invalid genres CSV syntax: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Genres CSV must contain an id,name header row.');
  }

  const [header, ...rows]: unknown[] = records;
  if (
    !isCsvRecord(header) ||
    header.length !== 2 ||
    new Set(header.map((column) => column.toLowerCase())).size !== 2 ||
    !header.some((column) => column.toLowerCase() === 'id') ||
    !header.some((column) => column.toLowerCase() === 'name')
  ) {
    throw new Error('Genres CSV header must contain exactly id and name.');
  }

  const idIndex = header.findIndex((column) => column.toLowerCase() === 'id');
  const nameIndex = header.findIndex(
    (column) => column.toLowerCase() === 'name',
  );

  return rows.map((row, index) => {
    if (!isCsvRecord(row) || row.length !== 2) {
      throw new Error(
        `Invalid genres CSV row ${index + 2}: expected 2 columns.`,
      );
    }

    const rawId = row[idIndex];
    const rawName = row[nameIndex];
    if (!/^[1-9]\d*$/.test(rawId)) {
      throw new Error(
        `Invalid genre id on CSV row ${index + 2}: expected a positive safe integer.`,
      );
    }

    const id = Number(rawId);
    if (!Number.isSafeInteger(id)) {
      throw new Error(
        `Invalid genre id on CSV row ${index + 2}: expected a positive safe integer.`,
      );
    }

    const name = rawName.trim();
    if (name.length === 0) {
      throw new Error(
        `Invalid genre name on CSV row ${index + 2}: name must not be empty.`,
      );
    }

    return { id, name };
  });
}
