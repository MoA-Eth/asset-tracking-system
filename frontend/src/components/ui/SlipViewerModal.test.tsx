import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlipViewerModal } from './SlipViewerModal';

const SLIP_URL = '/api/uploads/slips/f10839f2-8d8b-4213-b801-a9ab7c3cfcca-Model-19-slip.pdf';

const mockFetchResponse = (status: number, contentType: string) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (header: string) => (header.toLowerCase() === 'content-type' ? contentType : null),
    },
    blob: async () => new Blob(['%PDF-1.4'], { type: contentType }),
  });

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
    // Slips need the session token, so the new tab opens the file already loaded, not the bare address
    expect(screen.getByRole('link', { name: /open in new tab/i })).toHaveAttribute('href', 'blob:slip-preview');
  });

  it('sends the session token when loading a slip', async () => {
    const fetchMock = mockFetchResponse(200, 'application/pdf');
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('moa_token', 'session-token');
    render(<SlipViewerModal url={SLIP_URL} onClose={vi.fn()} />);
    await screen.findByTitle('IFMIS slip Model-19-slip.pdf');
    expect(fetchMock).toHaveBeenCalledWith(SLIP_URL, { headers: { Authorization: 'Bearer session-token' } });
    localStorage.removeItem('moa_token');
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
