/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { playNotificationChime } from './notification-sound';

describe('playNotificationChime', () => {
  let mockOscillator: any;
  let mockGain: any;
  let contextCreated = false;

  beforeEach(() => {
    contextCreated = false;
    mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createOscillator = vi.fn().mockReturnValue(mockOscillator);
      createGain = vi.fn().mockReturnValue(mockGain);
      resume = vi.fn().mockResolvedValue(undefined);
      constructor() {
        contextCreated = true;
      }
    }

    (window as any).AudioContext = MockAudioContext;
  });

  it('synthesizes two gentle chime tones when called', () => {
    playNotificationChime();

    expect(contextCreated).toBe(true);
    expect(mockOscillator.start).toHaveBeenCalledTimes(2);
    expect(mockOscillator.stop).toHaveBeenCalledTimes(2);
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledTimes(2);
  });

  it('gracefully handles missing AudioContext without crashing', () => {
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;

    expect(() => playNotificationChime()).not.toThrow();
  });
});
