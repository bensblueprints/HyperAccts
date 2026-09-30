import http from 'node:http';
import {readFile, appendFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

// Static pages served by the local preview (mirrors production Nginx content).
const files = new Map([
  ['/', 'index.html'],
  ['/pricing', 'pricing.html'],
  ['/purchase', 'purchase.html'],
  ['/purchase/success', 'success.html'],
  ['/purchase/cancel', 'cancel.html'],
  ['/terms', 'terms.html'],
  ['/privacy', 'privacy.html'],
  ['/refund', 'refund.html'],
  ['/eula', 'eula.html'],
  ['/site.css', 'site.css'],
  ['/site.mjs', 'site.mjs'],
  ['/purchase.mjs', 'purchase.mjs'],
  ['/mark.svg', 'mark.svg'],
  ['/downloads/HyperAccts-Setup-0.1.0.exe', 'downloads/HyperAccts-Setup-0.1.0.exe'],
]);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.exe': 'application/octet-stream',
};

// Privacy-respecting analytics: only these high-level event names are accepted.
// Request headers, cookies, and IP addresses are never read or recorded.
const ALLOWED_EVENTS = new Set(['page_view', 'checkout_start', 'purchase_complete']);

let stripeClient = null;
let stripeMissing = false;

// Lazy-load Stripe only when both required secrets are present. The local preview
// (no keys set) still serves static pages and returns 503 for checkout endpoints.
async function loadStripe() {
  if (stripeClient) return stripeClient;
  if (stripeMissing) return null;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  let Stripe;
  try {
    ({default: Stripe} = await import('stripe'));
  } catch {
    stripeMissing = true;
    return null;
  }
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Idempotent event store: one JSON line per Stripe event id, so retries do not duplicate.
async function recordEvent(file, event) {
  try {
    const dir = path.join(root, 'data');
    await mkdir(dir, {recursive: true});
    await appendFile(path.join(dir, file), JSON.stringify({
      id: event.id,
      type: event.type,
      received_at: new Date().toISOString(),
    }) + '\n');
  } catch {
    // Recording must not crash the webhook response path.
  }
}

// Append a sanitized analytics event. Only whitelisted event names and an optional
// safe label survive; no client identifiers, headers, cookies, or IPs are stored.
async function recordAnalytics(eventName, label) {
  try {
    const dir = path.join(root, 'data');
    await mkdir(dir, {recursive: true});
    const entry = {
      event: eventName,
      received_at: new Date().toISOString(),
    };
    if (label && typeof label === 'string' && label.length <= 200) {
      entry.label = label;
    }
    await appendFile(path.join(dir, 'events.jsonl'), JSON.stringify(entry) + '\n');
  } catch {
    // Analytics recording must never affect the request path.
  }
}

async function handleAnalyticsEvent(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
  } catch {
    return json(res, 400, {error: 'Invalid JSON.'});
  }
  const event = payload && payload.event;
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return json(res, 400, {error: 'Unsupported event.'});
  }
  await recordAnalytics(event, payload.label);
  return json(res, 200, {received: true});
}

async function createCheckoutSession(req, res) {
  const stripe = await loadStripe();
  if (!stripe) {
    return json(res, 503, {error: 'Payment processing is not configured.'});
  }
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return json(res, 503, {error: 'No Stripe price configured.'});
  }
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4180';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{price: priceId, quantity: 1}],
    success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/purchase/cancel`,
    allow_promotion_codes: false,
    customer_creation: 'always',
  });
  return json(res, 200, {url: session.url});
}

async function handleWebhook(req, res) {
  const stripe = await loadStripe();
  if (!stripe) return json(res, 503, {error: 'Webhook not configured.'});
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];
  const raw = await readBody(req);
  if (!secret || !signature) {
    return json(res, 400, {error: 'Missing webhook signature.'});
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return json(res, 400, {error: `Webhook signature verification failed: ${err.message}`});
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await recordEvent('checkout-sessions.jsonl', event);
      // Delivery gating (installer + license key) is deferred to task 491;
      // the server-side completion (source of truth) also records a purchase event.
      await recordAnalytics('purchase_complete', session.id);
      return json(res, 200, {received: true, session_id: session.id});
    }
    default:
      return json(res, 200, {received: true});
  }
}

async function serveFile(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    return res.end('Not found');
  }
  try {
    const data = await readFile(path.join(root, file));
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Download not available in this local preview yet.');
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    return createCheckoutSession(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/webhook') {
    return handleWebhook(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/event') {
    return handleAnalyticsEvent(req, res);
  }
  return serveFile(req, res);
});

server.listen(4180, '127.0.0.1', () => {
  console.log('Website preview: http://127.0.0.1:4180');
});
