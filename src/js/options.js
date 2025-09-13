document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  try {
    chrome.storage.sync.get(['firescope_pro_api_key'], res => {
      apiKeyInput.value = res.firescope_pro_api_key || '';
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
      });
    } catch (e) {
      console.warn('[FireScope Pro] Failed to save key:', e);
    }
  });
});
