import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonBadge,
  SkeletonButton,
  SkeletonCard,
  DashboardSkeleton,
  AssetsTableSkeleton,
  ApprovalsSkeleton,
  AuditLogSkeleton,
  ReportsSkeleton,
  MyAssetsSkeleton,
  UsersTableSkeleton,
  RolesSkeleton,
  StoresSkeleton,
  RecordDetailSkeleton,
  DocumentSkeleton,
} from './Skeleton';

describe('LinkedIn-Style Skeleton Components', () => {
  describe('Primitives', () => {
    it('renders base Skeleton with skeleton-shimmer class', () => {
      const { container } = render(<Skeleton className="w-24 h-4" />);
      const el = container.firstChild as HTMLElement;
      expect(el).toHaveClass('skeleton-shimmer');
      expect(el).toHaveClass('w-24');
      expect(el).toHaveClass('h-4');
    });

    it('renders SkeletonText with specified number of lines', () => {
      const { container } = render(<SkeletonText lines={4} />);
      const lines = container.querySelectorAll('.skeleton-shimmer');
      expect(lines).toHaveLength(4);
    });

    it('renders SkeletonAvatar with varying sizes', () => {
      const { container: c1 } = render(<SkeletonAvatar size="sm" />);
      expect(c1.firstChild).toHaveClass('h-8', 'w-8', 'rounded-full');

      const { container: c2 } = render(<SkeletonAvatar size="lg" />);
      expect(c2.firstChild).toHaveClass('h-11', 'w-11', 'rounded-full');
    });

    it('renders SkeletonBadge with rounded-full pill styling', () => {
      const { container } = render(<SkeletonBadge width="w-20" />);
      expect(container.firstChild).toHaveClass('rounded-full', 'w-20');
    });

    it('renders SkeletonButton with button-like dimensions', () => {
      const { container } = render(<SkeletonButton size="md" width="w-28" />);
      expect(container.firstChild).toHaveClass('w-28', 'rounded-[4px]');
    });

    it('renders SkeletonCard with border and shadow', () => {
      render(
        <SkeletonCard data-testid="test-card">
          <span>Card Content</span>
        </SkeletonCard>
      );
      const card = screen.getByTestId('test-card');
      expect(card).toHaveClass('border', 'bg-white');
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });
  });

  describe('Compound Page Skeletons', () => {
    it('renders DashboardSkeleton with role="status" and accessibility announcement', () => {
      render(<DashboardSkeleton />);
      const status = screen.getByRole('status', { name: /loading dashboard/i });
      expect(status).toBeInTheDocument();
      expect(screen.getByText(/loading dashboard…/i)).toBeInTheDocument();
    });

    it('renders AssetsTableSkeleton with column headers and rows', () => {
      const { container } = render(<AssetsTableSkeleton rows={5} />);
      const status = screen.getByRole('status', { name: /loading assets/i });
      expect(status).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(5);
    });

    it('renders ApprovalsSkeleton with table structure', () => {
      const { container } = render(<ApprovalsSkeleton rows={4} />);
      const status = screen.getByRole('status', { name: /loading approvals/i });
      expect(status).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(4);
    });

    it('renders AuditLogSkeleton with search bar and table', () => {
      const { container } = render(<AuditLogSkeleton rows={6} />);
      const status = screen.getByRole('status', { name: /loading audit log/i });
      expect(status).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(6);
    });

    it('renders ReportsSkeleton with stat cards and report structure', () => {
      const { container } = render(<ReportsSkeleton />);
      const status = screen.getByRole('status', { name: /loading reports/i });
      expect(status).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(6);
    });

    it('renders MyAssetsSkeleton with desktop and mobile layouts', () => {
      const { container } = render(<MyAssetsSkeleton />);
      const status = screen.getByRole('status', { name: /loading assigned assets/i });
      expect(status).toBeInTheDocument();
      const desktopRows = container.querySelectorAll('tbody tr');
      expect(desktopRows).toHaveLength(4);
    });

    it('renders UsersTableSkeleton with user columns', () => {
      const { container } = render(<UsersTableSkeleton rows={5} />);
      const status = screen.getByRole('status', { name: /loading users/i });
      expect(status).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(5);
    });

    it('renders RolesSkeleton with role cards', () => {
      render(<RolesSkeleton />);
      const status = screen.getByRole('status', { name: /loading roles/i });
      expect(status).toBeInTheDocument();
    });

    it('renders StoresSkeleton with warehouse cards', () => {
      render(<StoresSkeleton count={4} />);
      const status = screen.getByRole('status', { name: /loading stores/i });
      expect(status).toBeInTheDocument();
    });

    it('renders RecordDetailSkeleton with key-value grid', () => {
      render(<RecordDetailSkeleton />);
      const status = screen.getByRole('status', { name: /loading record/i });
      expect(status).toBeInTheDocument();
    });

    it('renders DocumentSkeleton with simulated document lines', () => {
      render(<DocumentSkeleton heightClass="h-96" />);
      const status = screen.getByRole('status', { name: /loading document/i });
      expect(status).toBeInTheDocument();
      expect(status).toHaveClass('h-96');
    });
  });
});
