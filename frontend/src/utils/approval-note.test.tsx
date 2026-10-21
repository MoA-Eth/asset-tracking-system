import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { approvalNoteOf } from './approval-note';
import { VoucherStatusBanner } from '../components/ui/VoucherStatusBanner';

const request = (extra: object) => ({ id: 'A', transactionType: 'STOCK_IN', status: 'PENDING', currentStage: 1, ...extra }) as any;

describe('why a voucher is not approved', () => {
  it('says who returned it, when and why', () => {
    expect(approvalNoteOf(request({
      status: 'RETURNED', returnedFromStage: 2, returnedAtGc: '2026-10-21', returnRemarks: 'Wrong buyer name',
      returnedBy: { fullNameEn: 'Getaneh G/mariam', role: 'DEPARTMENT_HEAD' },
    }))).toBe('Returned for correction by Getaneh G/mariam (Department Head) · 21 Oct 2026: Wrong buyer name');
  });

  it('says who rejected it, when and why; the role comes from the stage when unknown', () => {
    expect(approvalNoteOf(request({ status: 'REJECTED', currentStage: 1, reviewedAtGc: '2026-10-20', reviewRemarks: 'Not our delivery', reviewedBy: { fullNameEn: 'Getnet Taye' } })))
      .toBe('Rejected by Getnet Taye (Team Leader) · 20 Oct 2026: Not our delivery');
    expect(approvalNoteOf(request({ status: 'REJECTED', currentStage: 2 }))).toBe('Rejected by the Department Head');
  });

  it('is empty for a request waiting its turn or approved', () => {
    expect(approvalNoteOf(request({}))).toBeUndefined();
    expect(approvalNoteOf(request({ status: 'APPROVED' }))).toBeUndefined();
    expect(approvalNoteOf(undefined)).toBeUndefined();
  });

  it('is printed under the banner', () => {
    render(<VoucherStatusBanner state="PENDING" note="Returned for correction by Getnet Taye (Team Leader) · 21 Oct 2026: Price is entered as USD." />);
    expect(screen.getByText('NOT YET APPROVED · ገና አልጸደቀም')).toBeInTheDocument();
    expect(screen.getByText('Returned for correction by Getnet Taye (Team Leader) · 21 Oct 2026: Price is entered as USD.')).toBeInTheDocument();
  });
});

describe('the banner of a returned request', () => {
  it('says it is with the requester to correct, not waiting for the approvers, and why', () => {
    render(<VoucherStatusBanner state="RETURNED" note="Returned for correction by Getnet Taye (Team Leader) · 21 Oct 2026: Price is entered as USD." />);
    expect(screen.getByText('RETURNED FOR CORRECTION · ለእርማት ተመልሷል')).toBeInTheDocument();
    expect(screen.getByText(/sent back to the requester to correct and resubmit/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for the Team Leader and the Department Head/)).toBeNull();
    expect(screen.getByText(/Price is entered as USD\./)).toBeInTheDocument();
  });

  it('a rejected one keeps its own banner and reason', () => {
    render(<VoucherStatusBanner state="REJECTED" note="Rejected by Getnet Taye (Team Leader) · 20 Oct 2026: Not our delivery" />);
    expect(screen.getByText('REJECTED · ውድቅ ተደርጓል')).toBeInTheDocument();
    expect(screen.getByText(/Not our delivery/)).toBeInTheDocument();
  });
});
