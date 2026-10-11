import { identifier, optionalText, record, records } from '../admin/validation';
export type EditorialImage = Readonly<{
  id: string;
  label: string;
  url: string;
  width: number;
  height: number;
}>;
/** Only public image projections enter the block picker or preview. */
export function editorialImages(input: unknown): readonly EditorialImage[] {
  return records(input).flatMap((row) => {
    if (row['kind'] !== 'IMAGE' || row['visibility'] !== 'PUBLIC') return [];
    const url = optionalText(row['url']),
      width = row['width'],
      height = row['height'];
    if (
      url === null ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    )
      return [];
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      return [];
    const id = identifier(row['id']);
    const alt = record(row['altTextByLocale']);
    return [
      { id, label: optionalText(alt['en']) ?? optionalText(alt['fa']) ?? id, url, width, height },
    ];
  });
}
