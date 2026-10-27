import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordPdfViewer } from './RecordPdfViewer';
import { api } from '../../api/client';

vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { fullNameEn: 'Test User' } }) }));
vi.mock('../../api/client', () => ({ api: { getItemById: vi.fn() } }));

describe('an item record as an official document', () => {
  it('shows the record as a page, with its sections, history and Download PDF', async () => {
    vi.mocked(api.getItemById).mockResolvedValue({
      id: 'i1',
      itemCode: 'MOA-OFS-2026-0011',
      name: 'Calc ink',
      category: 'OFFICE_SUPPLIES',
      status: 'AVAILABLE',
      uom: 'PCS',
      unitCostETB: 100,
      vatApplicable: true,
      balance: { total: 4, issued: 1, available: 3 },
      ifmisSlipNumber: '0000070',
      ifmisSlipAttachmentUrl: '/uploads/slips/x.pdf',
      storeLocation: { siteName: 'Main store' },
      history: [{ id: 'h1', action: 'STOCK_IN_APPROVED', dateEc: '2019-02-10', dateGc: '2026-10-20', performedBy: 'Abebe (TEAM_LEADER)', notes: 'ok' }],
    } as any);
    render(<RecordPdfViewer itemId="i1" onClose={() => {}} />);

    expect(await screen.findByText('Official record')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Calc ink', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('4 received · 1 issued · 3 in store (PCS)')).toBeInTheDocument();
    expect(screen.getAllByText('Partly issued')).toHaveLength(2);
    expect(screen.getByText('Main store')).toBeInTheDocument();
    expect(screen.getByText('History (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Model 19 slip/ })).toBeInTheDocument();
  });
});
