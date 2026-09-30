import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlipViewerModal } from './SlipViewerModal';

const SLIP_URL = '/api/uploads/slips/f10839f2-8d8b-4213-b801-a9ab7c3cfcca-Model-19-slip.pdf';

const mockFetchResponse = (status: number, contentType: string) =>
  vi.fn().mockResolvedValue(
    new Response(new Blob(['%PDF-1.4'], { type: contentType }), {
      status,
      headers: { 'Content-Type': contentType },
    })
  );

describe('<SlipViewerModal />', () => {
  beforeEach(() => {
    // jsdom has no object URL support
    URL.createObjectURL = vi.fn(() => 'blob:slip-preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('previews an uploaded PDF slip with its readable file name', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(200, 'application/pdf'));
    render(<SlipViewerModal url={SLIP_URL} onClose={vi.fn()} />);

    expect(screen.getByText('Model-19-slip.pdf')).toBeInTheDocument();
    const frame = await screen.findByTitle('IFMIS slip Model-19-slip.pdf');
    expect(frame).toHaveAttribute('src', 'blob:slip-preview');
    expect(screen.getByRole('link', { name: /open in new tab/i })).toHaveAttribute('href', SLIP_URL);
  });

  it('shows an image slip as an image', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(200, 'image/png'));
    render(<SlipViewerModal url="/api/uploads/slips/scan.png" onClose={vi.fn()} />);

    expect(await screen.findByAltText('IFMIS slip scan.png')).toHaveAttribute('src', 'blob:slip-preview');
  });

  it('reports legacy slips that were never uploaded as not available', async () => {
    // Legacy paths fall through to the SPA and come back as HTML
    vi.stubGlobal('fetch', mockFetchResponse(200, 'text/html'));
    render(<SlipViewerModal url="/slips/sample-ifmis-slip.png" onClose={vi.fn()} />);

    expect(await screen.findByText('Slip file not available')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open in new tab/i })).not.toBeInTheDocument();
  });

  it('reports missing files (404) as not available', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(404, 'application/json'));
    render(<SlipViewerModal url={SLIP_URL} onClose={vi.fn()} />);

    expect(await screen.findByText('Slip file not available')).toBeInTheDocument();
  });

  it('closes on the close button and on Escape', () => {
    vi.stubGlobal('fetch', mockFetchResponse(200, 'application/pdf'));
    const onClose = vi.fn();
    render(<SlipViewerModal url={SLIP_URL} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close slip viewer/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
