// UI utility functions

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';

  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

function addLoading(button) {
  if (!button.querySelector('.loading')) {
    button.innerHTML += '<span class="loading"></span>';
    button.disabled = true;
  }
}

function removeLoading(button) {
  const loading = button.querySelector('.loading');
  if (loading) {
    loading.remove();
    button.disabled = false;
  }
}

export { showStatus, addLoading, removeLoading };
