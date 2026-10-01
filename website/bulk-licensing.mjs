// HyperAccts bulk license-key utilities.
//
// Extends website/licensing.mjs for batch operations.
// Functions generate license keys for multiple recipients and support
// webhook-driven bulk delivery confirmation.

import crypto from 'node:crypto';
import { issueLicenseKey, verifyLicenseKey, mintDeliveryToken } from './licensing.mjs';

// Generate license keys for a list of recipients.
// Returns an array of {recipient, key, token} objects.
export function generateBulkLicenseKeys(recipients, { ttlSeconds = 3600, rng = crypto.randomBytes } = {}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return [];
  }
  
  const results = [];
  for (const recipient of recipients) {
    const key = issueLicenseKey();
    if (!key) continue; // skip if LICENSE_SECRET is unset
    
    const token = mintDeliveryToken(recipient.sessionId || `bulk-${recipient.id || results.length}`, ttlSeconds);
    results.push({
      recipient,
      key,
      token,
      expires_in_seconds: ttlSeconds,
    });
  }
  return results;
}

// Generate license keys and attach them to recipient records for bulk creation.
// Useful when recipients are being created in bulk and need license keys assigned.
export function extendRecipientsWithLicenseKeys(recipients, options = {}) {
  if (!Array.isArray(recipients)) {
    return [];
  }
  
  return generateBulkLicenseKeys(recipients, options).map((result, index) => ({
    ...result.recipient,
    license_key: result.key,
    delivery_token: result.token,
    expires_in_seconds: result.expires_in_seconds,
    index,
  }));
}

// Create a delivery summary for bulk operations.
// This summary can be sent via webhook or email to confirm delivery to all recipients.
export function createDeliverySummary(results, { sender = 'HyperAccts', subjectPrefix = 'License delivery' } = {}) {
  const total = results.length;
  const successful = results.filter(r => r.key && r.token).length;
  const failed = total - successful;
  const deliveredAt = new Date().toISOString();
  
  const items = results.map(r => ({
    recipient: r.recipient.email || r.recipient.name || r.recipient.id,
    license_key: r.key,
    download_url: r.download_url || null,
    status: r.key && r.token ? 'delivered' : 'pending',
    issued_at: deliveredAt,
  }));
  
  return {
    total,
    successful,
    failed,
    delivered_at: deliveredAt,
    items,
    summary: `${successful}/${total} recipients received their license keys successfully.`,
  };
}

// Format delivery results for webhook notification.
// Includes license keys and download tokens for each recipient.
export function formatForWebhook(results, { webhookUrl, sessionId }) {
  const items = results.map(r => ({
    recipient_id: r.recipient.id || r.recipient.email || r.recipient.name,
    license_key: r.key,
    delivery_token: r.token,
    expires_in_seconds: r.expires_in_seconds,
    status: r.key && r.token ? 'verified' : 'pending',
  }));
  
  return {
    type: 'bulk_license_delivery',
    webhook_url: webhookUrl || null,
    parent_session_id: sessionId || null,
    timestamp: new Date().toISOString(),
    results: items,
  };
}

// Verify all license keys in a batch and return verification status.
export function verifyBulkLicenseKeys(results) {
  if (!Array.isArray(results)) {
    return { verified: [], failed: [] };
  }
  
  const verified = [];
  const failed = [];
  
  for (const { key, recipient } of results) {
    if (!key) {
      failed.push({ recipient, reason: 'No license key issued' });
      continue;
    }
    
    if (verifyLicenseKey(key)) {
      verified.push({ recipient, key });
    } else {
      failed.push({ recipient, key, reason: 'License key verification failed' });
    }
  }
  
  return { verified, failed };
}

// Generate a batch delivery summary for email notification.
export function formatEmailPayload(summary, { brandName = 'HyperAccts', baseUrl = 'https://hyperaccts.com' } = {}) {
  const { total, successful, items } = summary;
  const failedCount = total - successful;
  
  let itemsHtml = '';
  for (const item of items) {
    itemsHtml += `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${item.recipient}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:monospace">${item.license_key}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${item.status}</td>
    </tr>`;
  }
  
  return {
    subject: `${summary.summary}`,
    body: `<div>
      <h2>${brandName} License Delivery</h2>
      <p>${summary.summary}</p>
      <table style="margin:16px 0;width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:8px 0;text-align:left">Recipient</th>
            <th style="padding:8px 0;text-align:left">License Key</th>
            <th style="padding:8px 0;text-align:left">Status</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      ${failedCount > 0 ? `<p style="color:#b94e3e">Note: ${failedCount} recipients have pending license delivery.</p>` : ''}
    </div>`,
  };
}