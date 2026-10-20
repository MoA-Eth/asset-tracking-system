import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptItems, SlipLine } from './SlipLines';
import { AssetCategory, ItemCondition, ItemType } from '../../types/asset-management';

const TestReceiptTable: React.FC = () => {
  const [vatApplicable, setVatApplicable] = useState(false);
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
      vatApplicable: false,
      additionalCharges: 100,
    },
  ]);

  const handleToggleVat = (checked: boolean) => {
    setVatApplicable(checked);
    if (checked) {
      setLines((prev) => prev.map((l) => ({ ...l, vatApplicable: true, additionalCharges: 0 })));
    } else {
      setLines((prev) => prev.map((l) => ({ ...l, vatApplicable: false })));
    }
  };

  const base1 = (lines[0].quantity || 0) * (lines[0].unitPrice || 0);
  const vat1 = vatApplicable ? Math.round(base1 * 0.15 * 100) / 100 : 0;
  const line1Total = base1 + (vatApplicable ? vat1 : (lines[0].additionalCharges || 0));

  const base2 = (lines[1].quantity || 0) * (lines[1].unitPrice || 0);
  const vat2 = vatApplicable ? Math.round(base2 * 0.15 * 100) / 100 : 0;
  const line2Total = base2 + (vatApplicable ? vat2 : (lines[1].additionalCharges || 0));
  const grandTotal = line1Total + line2Total;

  return (
    <ReceiptItems
      first={<tr data-testid="first-row"><td colSpan={11}>First Item</td></tr>}
      lines={lines}
      vatApplicable={vatApplicable}
      onToggleVat={handleToggleVat}
      onChange={setLines}
      total={grandTotal}
    />
  );
};

describe('Model 19 ReceiptItems: VAT and Additional Charges Scenarios', () => {
  it('disables additional charges across all items and calculates VAT when master VAT is checked', async () => {
    const user = userEvent.setup();
    render(<TestReceiptTable />);

    const masterVat = screen.getByLabelText('VAT (15%) for all items') as HTMLInputElement;
    const addlInput2 = screen.getByLabelText('Item 2 additional charges') as HTMLInputElement;
    const addlInput3 = screen.getByLabelText('Item 3 additional charges') as HTMLInputElement;

    // Initially VAT is off
    expect(masterVat.checked).toBe(false);
    expect(addlInput2.disabled).toBe(false);
    expect(addlInput2.value).toBe('50');
    expect(addlInput3.disabled).toBe(false);
    expect(addlInput3.value).toBe('100');

    // Total should be: 550 + 1100 = 1,650 ETB
    expect(screen.getByText('1,650 ETB')).toBeInTheDocument();

    // Toggle master VAT on
    await user.click(masterVat);

    expect(masterVat.checked).toBe(true);
    expect(addlInput2.disabled).toBe(true);
    expect(addlInput2.value).toBe('');
    expect(addlInput2.title).toBe('Additional charges not allowed when price includes VAT');

    expect(addlInput3.disabled).toBe(true);
    expect(addlInput3.value).toBe('');
    expect(addlInput3.title).toBe('Additional charges not allowed when price includes VAT');

    // VAT badges: 500 * 0.15 = +75, 1000 * 0.15 = +150
    expect(screen.getByText('+75')).toBeInTheDocument();
    expect(screen.getByText('+150')).toBeInTheDocument();

    // Total with 15% VAT: (500 + 75) + (1000 + 150) = 1,725 ETB
    expect(screen.getByText('1,725 ETB')).toBeInTheDocument();

    // Uncheck master VAT -> Additional charges unlock
    await user.click(masterVat);
    expect(masterVat.checked).toBe(false);
    expect(addlInput2.disabled).toBe(false);
    expect(addlInput3.disabled).toBe(false);
  });

  it('categorizes IFMIS codes starting with 3 as Fixed asset on the row badge', async () => {
    const user = userEvent.setup();
    render(<TestReceiptTable />);

    const codeInput = screen.getByLabelText('Item 2 item code');

    // Initially Item 2 is Consumable
    expect(screen.getByLabelText('Item 2 item type')).toHaveTextContent('Consumable');

    // Type a code starting with 3
    await user.clear(codeInput);
    await user.type(codeInput, '308101101.0001');

    // Badge should now display "Fixed asset"
    expect(screen.getByLabelText('Item 2 item type')).toHaveTextContent('Fixed asset');

    // Type a code starting with 1
    await user.clear(codeInput);
    await user.type(codeInput, '108101101.0021');

    // Badge should now display "Consumable"
    expect(screen.getByLabelText('Item 2 item type')).toHaveTextContent('Consumable');
  });
});
