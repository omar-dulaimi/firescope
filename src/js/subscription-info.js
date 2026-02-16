export function normalizeApiBase(apiBase) {
  if (typeof apiBase !== 'string') return null;
  const trimmed = apiBase.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export async function fetchSubscriptionInfo({
  apiBase,
  apiKey,
  fetchImpl = globalThis.fetch,
}) {
  const normalizedBase = normalizeApiBase(apiBase);
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!normalizedBase) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'Pro backend URL is not configured.',
    };
  }

  if (!trimmedKey) {
    return {
      ok: false,
      code: 'MISSING_KEY',
      message: 'Enter an API key to view subscription details.',
    };
  }

  try {
    const res = await fetchImpl(`${normalizedBase}/subscription`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return {
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'API key is invalid, revoked, or expired.',
        };
      }

      let backendMessage = '';
      try {
        const payload = await res.json();
        backendMessage =
          payload?.error?.message || payload?.message || payload?.error || '';
      } catch (_e) {
        backendMessage = '';
      }

      return {
        ok: false,
        code: 'REQUEST_FAILED',
        message: backendMessage || `Subscription check failed (${res.status}).`,
      };
    }

    const data = await res.json();
    if (!data || typeof data !== 'object' || !data.subscription) {
      return {
        ok: false,
        code: 'INVALID_RESPONSE',
        message: 'Subscription response is invalid.',
      };
    }

    return {
      ok: true,
      subscription: data.subscription,
    };
  } catch (_e) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach Pro backend.',
    };
  }
}

export function formatSubscriptionDetails(subscription) {
  const expiresAt = subscription?.expiresAt || null;
  const createdAt = subscription?.createdAt || null;
  const daysRemaining =
    typeof subscription?.daysRemaining === 'number'
      ? subscription.daysRemaining
      : null;

  const formatDate = value => {
    if (!value) return 'n/a';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  return {
    name: subscription?.name || 'n/a',
    status: subscription?.status || 'unknown',
    createdAt: formatDate(createdAt),
    expiresAt: expiresAt ? formatDate(expiresAt) : 'Never',
    daysRemaining:
      daysRemaining === null
        ? 'Unlimited'
        : `${Math.max(0, daysRemaining)} day(s)`,
    isLifetime: !!subscription?.isLifetime,
    seats:
      typeof subscription?.seats === 'number'
        ? String(Math.max(0, subscription.seats))
        : 'n/a',
  };
}
