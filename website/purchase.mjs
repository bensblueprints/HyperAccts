const button = document.querySelector('#checkout-button');
const statusEl = document.querySelector('#checkout-status');

if (button) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    statusEl.textContent = 'Redirecting to Stripe secure checkout…';
    try {
      const res = await fetch('/api/create-checkout-session', {method: 'POST'});
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start checkout.');
      }
      window.location.href = data.url;
    } catch (err) {
      button.disabled = false;
      statusEl.textContent = err.message || 'Checkout is unavailable right now. Please try again.';
    }
  });
}
