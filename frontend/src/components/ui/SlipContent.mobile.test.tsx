import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlipContent } from './SlipViewerModal';

const openPdf = vi.hoisted(() => vi.fn());
vi.mock('../../utils/slip-reader', () => ({ openPdf }));

const ready = { status: 'ready' as const, kind: 'pdf' as const, objectUrl: 'blob:slip' };
const setViewer = (enabled: boolean | undefined) => Object.defineProperty(navigator, 'pdfViewerEnabled', { value: enabled, configurable: true });

afterEach(() => {
  setViewer(undefined);
  vi.restoreAllMocks();
});

describe('the slip preview on a phone', () => {
  it("uses the browser's own PDF viewer where there is one", () => {
    setViewer(true);
    render(<SlipContent state={ready} fileName="model19.pdf" />);
    expect(screen.getByTitle('IFMIS slip model19.pdf').tagName).toBe('IFRAME');
  });

  it('draws the pages itself where the browser has no PDF viewer (Chrome on Android)', async () => {
    setViewer(false);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ blob: async () => new Blob(['%PDF']) } as Response);
    const page = {
      getViewport: () => ({ width: 100, height: 140 }),
      render: () => ({ promise: Promise.resolve() }),
    };
    openPdf.mockResolvedValue({ numPages: 2, getPage: async () => page, destroy: async () => {} });
    // jsdom has no canvas: a stand-in that draws nothing and gives a picture back
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');

    render(<SlipContent state={ready} fileName="model19.pdf" />);
    expect(screen.queryByTitle('IFMIS slip model19.pdf')).toBeNull();
    expect(await screen.findByAltText('model19.pdf, page 1 of 2')).toBeInTheDocument();
    expect(screen.getByAltText('model19.pdf, page 2 of 2')).toBeInTheDocument();
  });

  it('offers to open the PDF when it cannot be drawn', async () => {
    setViewer(false);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ blob: async () => new Blob(['%PDF']) } as Response);
    openPdf.mockRejectedValue(new Error('broken'));
    render(<SlipContent state={ready} fileName="model19.pdf" />);
    expect(await screen.findByRole('link', { name: /Open the PDF/ })).toHaveAttribute('href', 'blob:slip');
  });
});
