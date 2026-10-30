/**
 * The Assets page remembers its filters per person in this browser. A dashboard figure opens it on the list behind
 * that figure by writing the view the page reads when it opens; the other filters are cleared so nothing else narrows it.
 */
export const assetsViewKey = (userId?: string) => `moa_assets_view_${userId || 'anon'}`;

export interface AssetsPreset {
  /** The status shown: everything, in store, or assigned (issued) */
  filter?: 'ALL' | 'IN_STORE' | 'ISSUED';
  category?: string;
  /** The directorate holding them */
  department?: string;
  /** Fixed assets or consumables (for this visit only) */
  itemType?: 'FIXED' | 'CONSUMABLE';
  staleOnly?: boolean;
}

export function presetAssetsView(userId: string | undefined, preset: AssetsPreset): void {
  try {
    const saved = JSON.parse(localStorage.getItem(assetsViewKey(userId)) || '{}');
    localStorage.setItem(
      assetsViewKey(userId),
      JSON.stringify({
        ...saved,
        filter: preset.filter ?? 'ALL',
        location: 'ALL',
        category: preset.category ?? 'ALL',
        department: preset.department ?? 'ALL',
        staleOnly: preset.staleOnly ?? false,
        itemType: preset.itemType,
      }),
    );
  } catch {
    // Storage can be unavailable (private window): the page then opens on its usual view
  }
}
