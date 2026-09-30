const button = document.querySelector('#checkout-button');
const statusEl = document.querySelector('#checkout-status');

function track(event, label) {
  // Privacy-respecting analytics: high-level events only, no card or provider data.
  try {
    const body = JSON.stringify({event, label});
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/event', new Blob([body], {type: 'application/json'}));
    } else {
      fetch('/api/event', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Analytics must never block checkout.
  }
}

if (button) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    statusEl.textContent = 'Redirecting to Stripe secure checkout…';
    track('checkout_start');
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
