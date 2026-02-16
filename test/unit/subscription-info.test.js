import { describe, expect, it } from 'vitest';
import {
  fetchSubscriptionInfo,
  formatSubscriptionDetails,
  normalizeApiBase,
} from '../../src/js/subscription-info.js';

describe('subscription-info', () => {
  it('normalizes API base URL by trimming and removing trailing slash', () => {
    expect(normalizeApiBase(' https://api.example.com/ ')).toBe(
      'https://api.example.com'
    );
  });

  it('returns NOT_CONFIGURED when apiBase is missing', async () => {
    const result = await fetchSubscriptionInfo({
      apiBase: '',
      apiKey: 'fsp_key',
      fetchImpl: () => Promise.reject(new Error('should not call fetch')),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_CONFIGURED');
  });

  it('returns MISSING_KEY when apiKey is empty', async () => {
    const result = await fetchSubscriptionInfo({
      apiBase: 'https://api.example.com',
      apiKey: '',
      fetchImpl: () => Promise.reject(new Error('should not call fetch')),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_KEY');
  });

  it('returns UNAUTHORIZED for 401 responses', async () => {
    const result = await fetchSubscriptionInfo({
      apiBase: 'https://api.example.com',
      apiKey: 'fsp_key',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns parsed subscription on success', async () => {
    const result = await fetchSubscriptionInfo({
      apiBase: 'https://api.example.com/',
      apiKey: 'fsp_key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          subscription: {
            name: 'Acme Team',
            status: 'active',
            createdAt: '2026-02-14T00:00:00Z',
            expiresAt: null,
            isLifetime: true,
            daysRemaining: null,
            seats: 5,
          },
        }),
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.subscription.name).toBe('Acme Team');
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.seats).toBe(5);
  });

  it('formats lifetime subscription fields', () => {
    const details = formatSubscriptionDetails({
      name: 'Acme Team',
      status: 'active',
      createdAt: '2026-02-14T00:00:00Z',
      expiresAt: null,
      isLifetime: true,
      daysRemaining: null,
      seats: 5,
    });

    expect(details.name).toBe('Acme Team');
    expect(details.status).toBe('active');
    expect(details.expiresAt).toBe('Never');
    expect(details.daysRemaining).toBe('Unlimited');
    expect(details.isLifetime).toBe(true);
    expect(details.seats).toBe('5');
  });
});
