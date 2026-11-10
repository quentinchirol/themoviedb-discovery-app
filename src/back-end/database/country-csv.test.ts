import { describe, expect, it } from 'vitest';
import { parseCountriesCsv } from './country-csv.ts';

describe('parseCountriesCsv', () => {
  it('parses case-insensitive headers in either order with LF or CRLF and a BOM', () => {
    expect(
      parseCountriesCsv('\uFEFFNAME,Code\r\n"United, States",US\r\nFrance,FR'),
    ).toEqual([
      { code: 'US', name: 'United, States' },
      { code: 'FR', name: 'France' },
    ]);
  });

  it('trims values, parses escaped quotes, and ignores empty rows', () => {
    expect(
      parseCountriesCsv(`code,name
 FR ,"Cote ""d'Ivoire"""

,
  
`),
    ).toEqual([{ code: 'FR', name: 'Cote "d\'Ivoire"' }]);
  });

  it('returns an empty list for a header-only document', () => {
    expect(parseCountriesCsv('code,name\n')).toEqual([]);
  });

  it.each([
    ['', 'missing headers'],
    ['code,region,name\nFR,Europe,France', 'extra header'],
    ['code,code\nFR,France', 'duplicate headers'],
  ])('rejects invalid headers: %s (%s)', (csv) => {
    expect(() => parseCountriesCsv(csv)).toThrow(/CSV/);
  });

  it.each(['fr,France', 'USA,United States', 'F1,Invalid'])(
    'rejects invalid country code %s',
    (row) => {
      expect(() => parseCountriesCsv(`code,name\n${row}`)).toThrow(
        'invalid country code',
      );
    },
  );

  it('rejects empty names and rows with the wrong number of values', () => {
    expect(() => parseCountriesCsv('code,name\nFR,  ')).toThrow(
      'empty country name',
    );
    expect(() => parseCountriesCsv('code,name\nFR,France,extra')).toThrow(
      'exactly two values',
    );
  });

  it('propagates malformed CSV syntax errors', () => {
    expect(() => parseCountriesCsv('code,name\nFR,"France')).toThrow();
  });
});
