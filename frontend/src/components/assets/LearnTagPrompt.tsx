import React, { useState } from 'react';
import { Tag } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ItemStatus, ItemType, ItemWithRelations } from '../../types/asset-management';
import { SearchableSelect } from '../ui/SearchableSelect';
import { btn } from '../ui/theme';

/** The fixed assets a tag can be recorded on: received, not disposed of, and without an IFMIS tag of their own yet */
export const taggableAssets = (items: ItemWithRelations[], learned?: Map<string, string>) =>
  items.filter(
    (i) =>
      i.itemType !== ItemType.CONSUMABLE &&
      !(learned?.get(i.id) ?? i.ifmisTagNumber) &&
      i.status !== ItemStatus.PENDING_STOCK_IN &&
      i.status !== ItemStatus.REJECTED &&
      i.status !== ItemStatus.DISPOSED,
  );

interface LearnTagPromptProps {
  /** Tag numbers the IFMIS form names that no asset here has */
  tags: string[];
  /** The assets one of them may be */
  candidates: ItemWithRelations[];
  /** The asset to offer first, e.g. the one the form is open for */
  suggestedId?: string;
  /** Called with the tag and the asset it was saved on; the form is then read again */
  onLearned: (tag: string, item: ItemWithRelations) => void;
}

/**
 * IFMIS names a fixed asset by its own tag number (e.g. MOA-016341), which the receipt doesn't carry. When a Model 21 or
 * disposal form names a tag no asset here has, this offers to pick the asset and record the tag on it, so this form and
 * every later one match it.
 */
export const LearnTagPrompt: React.FC<LearnTagPromptProps> = ({ tags, candidates, suggestedId, onLearned }) => {
  const toast = useToast();
  const suggested = candidates.some((c) => c.id === suggestedId) ? suggestedId! : '';
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (!tags.length || !candidates.length) return null;

  const options = [...candidates]
    .sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested) || a.itemCode.localeCompare(b.itemCode))
    .map((c) => ({
      value: c.id,
      label: `${c.itemCode} · ${c.name}`,
      note: c.id === suggested ? 'this asset' : c.currentCustodian?.fullNameEn || (c.status === ItemStatus.AVAILABLE ? 'in store' : undefined),
    }));

  const save = async (tag: string) => {
    const id = chosen[tag] ?? suggested;
    if (!id) return;
    setSaving(tag);
    try {
      const { item } = await api.setIfmisTag(id, tag);
      toast.success('IFMIS tag recorded', `${tag} is now the IFMIS tag number of ${item.itemCode}.`);
      onLearned(tag, item);
    } catch (err: any) {
      toast.warning("The tag wasn't recorded", err?.message || 'Try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div role="group" aria-label="Unknown IFMIS tag numbers" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      {tags.map((tag) => {
        const id = chosen[tag] ?? suggested;
        return (
          <div key={tag} className="space-y-1.5">
            <p className="flex items-start gap-2">
              <Tag className="mt-px h-4 w-4 shrink-0 text-amber-600" />
              <span>
                No asset here has the IFMIS tag <span className="font-mono font-bold">{tag}</span>. If it is one of yours, pick it and record the tag; this form and later ones then find it.
              </span>
            </p>
            <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 bg-white">
                <SearchableSelect
                  id={`learn-tag-${tag}`}
                  value={id}
                  onChange={(value) => setChosen((c) => ({ ...c, [tag]: value }))}
                  groups={[{ label: 'Fixed assets without an IFMIS tag', options }]}
                  placeholder="Which asset is it?"
                  searchPlaceholder="Type a code or name…"
                />
              </div>
              <button type="button" className={btn.secondary} disabled={!id || saving === tag} onClick={() => save(tag)}>
                {saving === tag ? 'Saving…' : 'Save as its IFMIS tag'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
