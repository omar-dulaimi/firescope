import {
  fetchSubscriptionInfo,
  formatSubscriptionDetails,
} from './subscription-info.js';

document.addEventListener('DOMContentLoaded', () => {
  const apiBase = import.meta.env.VITE_PRO_API_BASE || '';
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');
  const refreshBtn = document.getElementById('refreshSubscription');
  const subscriptionMessage = document.getElementById('subscriptionMessage');
  const subscriptionDetails = document.getElementById('subscriptionDetails');
  const subStatus = document.getElementById('subStatus');
  const subName = document.getElementById('subName');
  const subSeats = document.getElementById('subSeats');
  const subCreated = document.getElementById('subCreated');
  const subExpires = document.getElementById('subExpires');
  const subRemaining = document.getElementById('subRemaining');

  const showSubscriptionMessage = (message, kind = 'muted') => {
    subscriptionMessage.textContent = message;
    subscriptionMessage.className = kind === 'error' ? 'error' : 'muted';
    subscriptionDetails.style.display = 'none';
  };

  const showSubscriptionDetails = details => {
    subStatus.textContent = details.status;
    subName.textContent = details.name;
    subSeats.textContent = details.seats;
    subCreated.textContent = details.createdAt;
    subExpires.textContent = details.expiresAt;
    subRemaining.textContent = details.daysRemaining;

    subscriptionDetails.style.display = 'grid';
    subscriptionMessage.className = 'muted';
    subscriptionMessage.textContent = details.isLifetime
      ? 'Lifetime subscription detected.'
      : 'Subscription is active.';
  };

  const refreshSubscription = async () => {
    refreshBtn.disabled = true;
    showSubscriptionMessage('Checking subscription...');

    const result = await fetchSubscriptionInfo({
      apiBase,
      apiKey: apiKeyInput.value,
    });

    if (!result.ok) {
      showSubscriptionMessage(
        result.message,
        result.code === 'UNAUTHORIZED' ? 'error' : 'muted'
      );
      refreshBtn.disabled = false;
      return;
    }

    showSubscriptionDetails(formatSubscriptionDetails(result.subscription));
    refreshBtn.disabled = false;
  };

  try {
    chrome.storage.sync.get(['firescope_pro_api_key'], res => {
      apiKeyInput.value = res.firescope_pro_api_key || '';
      refreshSubscription();
    });
  } catch (e) {
    console.warn('[FireScope Pro] Failed to read key:', e);
  }

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    try {
      chrome.storage.sync.set({ firescope_pro_api_key: key }, () => {
        status.style.display = 'inline';
        setTimeout(() => (status.style.display = 'none'), 1500);
        refreshSubscription();
      });
    } catch (e) {
      console.warn('[FireScope Pro] Failed to save key:', e);
    }
  });

  refreshBtn.addEventListener('click', () => {
    refreshSubscription();
  });
});
