import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptItems, SlipLine } from './SlipLines';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';

const TestReceiptTable: React.FC = () => {
  const [lines, setLines] = useState<SlipLine[]>([
    {
      key: 1,
      name: 'Item 2 Consumable',
      category: AssetCategory.OFFICE_SUPPLIES,
      itemType: ItemType.CONSUMABLE,
      condition: ItemCondition.NEW,
      uom: 'EA',
      quantity: 5,
      unitPrice: 100,
      vatApplicable: false,
      additionalCharges: 50,
    },
    {
      key: 2,
      name: 'Item 3 IT Asset',
      category: AssetCategory.IT_EQUIPMENT,
      itemType: ItemType.FIXED,
      condition: ItemCondition.NEW,
      uom: 'EA',
      quantity: 1,
      unitPrice: 1000,
      vatApplicable: true,
      additionalCharges: 0,
    },
  ]);

  const base1 = (lines[0].quantity || 0) * (lines[0].unitPrice || 0);
  const vat1 = lines[0].vatApplicable ? Math.round(base1 * 0.15 * 100) / 100 : 0;
  const line1Total = base1 + (lines[0].vatApplicable ? vat1 : (lines[0].additionalCharges || 0));

  const base2 = (lines[1].quantity || 0) * (lines[1].unitPrice || 0);
  const vat2 = lines[1].vatApplicable ? Math.round(base2 * 0.15 * 100) / 100 : 0;
  const line2Total = base2 + (lines[1].vatApplicable ? vat2 : (lines[1].additionalCharges || 0));
  const grandTotal = line1Total + line2Total;

  return (
    <ReceiptItems
      first={<tr data-testid="first-row"><td>First Item</td></tr>}
      lines={lines}
      onChange={setLines}
      total={grandTotal}
    />
  );
};

describe('Model 19 ReceiptItems: VAT and Additional Charges Scenarios', () => {
  it('disables additional charges and sets them to 0 when VAT is checked', async () => {
    const user = userEvent.setup();
    render(<TestReceiptTable />);

    // Item 2 starts with VAT unchecked and additional charges = 50
    const vatCheck2 = screen.getByLabelText('Item 2 VAT applicable') as HTMLInputElement;
    const addlInput2 = screen.getByLabelText('Item 2 additional charges') as HTMLInputElement;

    expect(vatCheck2.checked).toBe(false);
    expect(addlInput2.disabled).toBe(false);
    expect(addlInput2.value).toBe('50');

    // Item 3 starts with VAT checked and additional charges = 0 (disabled)
    const vatCheck3 = screen.getByLabelText('Item 3 VAT applicable') as HTMLInputElement;
    const addlInput3 = screen.getByLabelText('Item 3 additional charges') as HTMLInputElement;

    expect(vatCheck3.checked).toBe(true);
    expect(addlInput3.disabled).toBe(true);
    expect(addlInput3.value).toBe('');
    expect(addlInput3.title).toBe('Additional charges not allowed when price includes VAT');

    // Grand total should initially be: Line 1 (5*100 + 50 = 550) + Line 2 (1*1000 + 0 = 1000) = 1,550 ETB
    expect(screen.getByText('1,700 ETB')).toBeInTheDocument();

    // Check VAT on Item 2 -> Additional charges should be cleared to 0 and disabled
    await user.click(vatCheck2);

    expect(vatCheck2.checked).toBe(true);
    expect(addlInput2.disabled).toBe(true);
    expect(addlInput2.value).toBe('');
    expect(addlInput2.title).toBe('Additional charges not allowed when price includes VAT');

    // Grand total should now drop to: Line 1 (500) + Line 2 (1000) = 1,500 ETB
    expect(screen.getByText('1,725 ETB')).toBeInTheDocument();

    // Uncheck VAT on Item 2 -> Additional charges unlocks
    await user.click(vatCheck2);
    expect(vatCheck2.checked).toBe(false);
    expect(addlInput2.disabled).toBe(false);
  });
});
