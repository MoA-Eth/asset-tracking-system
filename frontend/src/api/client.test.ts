import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('API connectivity', () => {
  it('sends login to the same host as the page, including on Wi-Fi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { token: 'test', user: {} } })));
    vi.stubGlobal('fetch', fetchMock);
    await api.login({ usernameOrEmail: 'encoder@moa.gov.et', password: 'test' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('explains a connection failure instead of showing a raw fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.getMe()).rejects.toThrow('Cannot reach the AMS server');
  });

  it('stops waiting when the server does not respond', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const assertion = expect(api.getMe()).rejects.toThrow('took too long to respond');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('preserves the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Incorrect password.' } }), { status: 401 })));
    await expect(api.getMe()).rejects.toThrow('Incorrect password.');
  });

  it('explains a gateway or wrong address returning HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Wi-Fi sign-in</html>')));
    await expect(api.getMe()).rejects.toThrow('correct app address');
  });
});
