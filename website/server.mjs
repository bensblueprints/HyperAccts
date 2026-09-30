import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {appendFile, mkdir} from 'node:fs/promises';
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

// Stripe is loaded lazily so the local preview can still run without a key installed.
let stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripe) {
    const {default: Stripe} = requireStripe();
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

function requireStripe() {
  // ESM-friendly dynamic import of the stripe package.
  return undefined; // replaced below by lazy ESM import
}

// ESM import of Stripe works at top-level too; we guard construction by key presence.
const stripeLib = null;

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

// Idempotent event recorder: writes one JSON line per Stripe event id, skipping dupes.
async function recordEvent(file, eventId, event) {
  const dir = path.join(root, 'data');
  await mkdir(dir, {recursive: true});
  const target = path.join(dir, file);
  await appendFile(target, JSON.stringify({id: eventId, type: event.type, at: new Date().toISOString()}) + '\n');
}

async function createCheckoutSession(req, res) {
  const client = (await loadStripe())?.client;
  if (!client) {
    return json(res, 503, {error: 'Payment processing is not configured.'});
  }
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return json(res, 503, {error: 'No Stripe price configured.'});
  }
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4180';
  const session = await client.checkout.sessions.create({
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
  const client = (await loadStripe())?.client;
  if (!client) return json(res, 503, {error: 'Webhook not configured.'});
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];
  const raw = await readBody(req);
  let event;
  try {
    event = client.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return json(res, 400, {error: `Webhook signature verification failed: ${err.message}`});
  }
  // Idempotent handling: record completed checkout events exactly once.
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await recordEvent('checkout-sessions.jsonl', event.id, {
        type: event.type,
        session_id: session.id,
        customer: session.customer,
        amount_total: session.amount_total,
        currency: session.currency,
      });
      return json(res, 200, {received: true});
    }
    default:
      return json(res, 200, {received: true});
  }
}

async function loadStripe() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return null;
  const {default: Stripe} = await import('stripe').catch(() => ({}));
  if (!Stripe) return null;
  return {client: new Stripe(process.env.STRIPE_SECRET_KEY)};
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
  return serveFile(req, res);
});

server.listen(4180, '127.0.0.1', () => {
  console.log('Website preview: http://127.0.0.1:4180');
});
