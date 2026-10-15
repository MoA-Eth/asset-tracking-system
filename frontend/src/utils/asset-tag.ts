import { ItemWithRelations } from '../types/asset-management';

/** A tag as compared: no spaces, any case */
export const tagKey = (tag?: string | null) => (tag ?? '').replace(/\s+/g, '').toLowerCase();

/**
 * The asset an IFMIS form names by its tag number: its IFMIS tag number first, then its record code, then its serial
 * number (older records). `learned` holds tags recorded on this form that the list doesn't show yet (item id → tag).
 */
export const findByTag = <T extends ItemWithRelations>(items: T[], tag?: string | null, learned?: Map<string, string>): T | undefined => {
  const key = tagKey(tag);
  if (!key) return undefined;
  return (
    items.find((i) => tagKey(learned?.get(i.id) ?? i.ifmisTagNumber) === key) ??
    items.find((i) => tagKey(i.itemCode) === key) ??
    items.find((i) => !!i.serialNumber?.trim() && tagKey(i.serialNumber) === key)
  );
};

/** The tag printed on a Model 21 or disposal form: the IFMIS one when the asset has it, as IFMIS prints, else the record code */
export const printedTag = (item?: Pick<ItemWithRelations, 'ifmisTagNumber' | 'itemCode'> | null) => item?.ifmisTagNumber || item?.itemCode || '';
