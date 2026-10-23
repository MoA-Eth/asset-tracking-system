import { describe, it, expect } from 'vitest';
import { formatVoucherRemark } from './voucher-remark';

describe('formatVoucherRemark', () => {
  it('returns undefined for empty, null, or undefined remark', () => {
    expect(formatVoucherRemark(undefined)).toBeUndefined();
    expect(formatVoucherRemark(null)).toBeUndefined();
    expect(formatVoucherRemark('')).toBeUndefined();
    expect(formatVoucherRemark('   ')).toBeUndefined();
  });

  it('filters out voucher-level Program Name from line remark', () => {
    expect(formatVoucherRemark('Program: MoA-Program to Build Resilience')).toBeUndefined();
    expect(formatVoucherRemark('program: Food Security Project')).toBeUndefined();
  });

  it('filters out voucher-level Source from line remark', () => {
    expect(formatVoucherRemark('Source: EM Stationery and Cleaning Materials Trade')).toBeUndefined();
    expect(formatVoucherRemark('source: Supplier Name')).toBeUndefined();
  });

  it('keeps genuine plain-text user remarks', () => {
    expect(formatVoucherRemark('Minor scratch on side')).toBe('Minor scratch on side');
    expect(formatVoucherRemark('Delivered without packaging')).toBe('Delivered without packaging');
  });

  it('extracts real user notes from JSON payload without leaking programName', () => {
    const json = JSON.stringify({
      programName: 'MoA Resilience Project',
      userNotes: 'Received in good condition',
    });
    expect(formatVoucherRemark(json)).toBe('Received in good condition');
  });

  it('returns undefined if JSON payload only contains voucher-level programName or source', () => {
    const json = JSON.stringify({
      programName: 'MoA Resilience Project',
      source: 'Global Donors',
    });
    expect(formatVoucherRemark(json)).toBeUndefined();
  });
});
