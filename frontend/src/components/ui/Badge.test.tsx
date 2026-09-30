import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, StatusBadge, ConditionBadge } from './Badge';
import { ItemStatus, ApprovalStatus } from '../../types/asset-management';

describe('<Badge /> & Status Badges', () => {
  describe('<Badge />', () => {
    it('renders text children correctly', () => {
      render(<Badge variant="success">Standard Badge</Badge>);
      expect(screen.getByText('Standard Badge')).toBeInTheDocument();
    });

    it('applies danger variant classes for red alert status', () => {
      const { container } = render(<Badge variant="danger">High Risk</Badge>);
      const badge = container.querySelector('span');
      expect(badge?.className).toContain('text-red-800');
    });

    it('renders small size when size="sm" is passed', () => {
      const { container } = render(<Badge size="sm">Compact</Badge>);
      const badge = container.querySelector('span');
      expect(badge?.className).toContain('text-[9px]');
    });
  });

  describe('<StatusBadge />', () => {
    it.each([
      [ItemStatus.AVAILABLE, 'Available (In Store)'],
      [ItemStatus.ISSUED, 'Issued'],
      [ItemStatus.PENDING_STOCK_IN, 'Pending Stock-In'],
      [ItemStatus.PENDING_STOCK_OUT, 'Pending Stock-Out'],
      [ItemStatus.UNDER_TRANSFER, 'In-Transfer'],
      [ItemStatus.DISPOSED, 'Disposed'],
      [ApprovalStatus.APPROVED, 'Approved'],
      [ApprovalStatus.PENDING, 'Pending'],
      [ApprovalStatus.REJECTED, 'Rejected'],
    ])('renders correct label for status %s', (status, expectedText) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });

    it('formats unmapped statuses with neutral replacement', () => {
      render(<StatusBadge status="CUSTOM_UNMAPPED_STATUS" />);
      expect(screen.getByText('CUSTOM UNMAPPED STATUS')).toBeInTheDocument();
    });
  });

  describe('<ConditionBadge />', () => {
    it.each([
      ['NEW', 'Brand New'],
      ['GOOD', 'Good Condition'],
      ['FAIR', 'Fair / Usable'],
      ['NEEDS_REPAIR', 'Needs Repair'],
      ['DAMAGED', 'Damaged / Defective'],
    ])('renders label for condition %s', (condition, expectedLabel) => {
      render(<ConditionBadge condition={condition} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });
});
