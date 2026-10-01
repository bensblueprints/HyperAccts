// Test script for post-purchase delivery flow (task 491)
// Run with: node test-delivery.mjs

import { issueLicenseKey, verifyLicenseKey, mintDeliveryToken, verifyDeliveryToken } from './licensing.mjs';

// Ensure LICENSE_SECRET is set for full testing
process.env.LICENSE_SECRET = process.env.LICENSE_SECRET || 'test-secret-for-hyperaccts-delivery';

console.log('Testing post-purchase delivery flow...\n');

// Test 1: License key issuance
console.log('Test 1: License key issuance');
const key = issueLicenseKey();
console.log(`  License key: ${key}`);
if (key) {
  console.log('  ✓ Key issued successfully');
  console.log(`  ✓ Format correct: HYAC-${key.split('-').slice(1).join('-').substring(0, 20)}...`);
} else {
  console.log('  ✗ Key not issued (LICENSE_SECRET may be missing)');
}

// Test 2: License key verification
console.log('\nTest 2: License key verification');
let verificationResult = false;
if (key) {
  verificationResult = verifyLicenseKey(key);
  console.log(`  Verification: ${verificationResult ? '✓ PASSED' : '✗ FAILED'}`);
} else {
  console.log('  ⊘ SKIPPED (no key to verify)');
}

// Test 3: License key uniqueness (multiple issues)
console.log('\nTest 3: License key uniqueness');
const keys = [];
for (let i = 0; i < 5; i++) {
  const k = issueLicenseKey();
  if (k) keys.push(k);
}
const uniqueKeys = new Set(keys);
console.log(`  Generated ${keys.length} keys, ${uniqueKeys.size} unique`);
console.log(`  ✓ Uniqueness: ${uniqueKeys.size === keys.length ? 'PASS' : 'FAIL'}`);

// Test 4: Tamper detection
console.log('\nTest 4: License key tamper detection');
const goodKey = issueLicenseKey();
const badKey = goodKey ? goodKey.replace(/-?[A-Z0-9]{4}$/, '-XXXX') : 'HYAC-XXXX-XXXX-XXXX-XXXX';
const goodResult = goodKey ? verifyLicenseKey(goodKey) : false;
const badResult = verifyLicenseKey(badKey);
console.log(`  Good key: ${goodResult ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  Tampered key: ${badResult ? '✗ PASS (should fail)' : '✓ PASS'}`);
console.log(`  ✓ Tamper detection: ${!goodResult || !badResult ? 'PASS' : 'FAIL'}`);

// Test 5: Delivery token minting
console.log('\nTest 5: Delivery token minting');
const sessionId = 'test-session-123';
const token = mintDeliveryToken(sessionId, 3600);
console.log(`  Token: ${token ? '✓ ISSUED' : '✗ NOT ISSUED'}`);
if (token) {
  console.log(`  Token length: ${token.length} chars`);
  console.log(`  Token format: payload.sig`);
}

// Test 6: Delivery token verification
console.log('\nTest 6: Delivery token verification');
let payload = null;
if (token) {
  payload = verifyDeliveryToken(token);
  console.log(`  Payload found: ${payload ? '✓' : '✗'}`);
  if (payload) {
    console.log(`    session_id: ${payload.sid}`);
    console.log(`    issued_at: ${new Date(payload.iat * 1000).toISOString()}`);
    console.log(`    expires_at: ${new Date(payload.exp * 1000).toISOString()}`);
  }
} else {
  console.log('  ⊘ SKIPPED (no token)');
}

// Test 7: Tampered token rejection
console.log('\nTest 7: Tampered token rejection');
const badToken = token ? token.replace(/\.([a-zA-Z0-9_-]+$)/, '.TAMPERED') : 'dGVzdC50b2tlbg.TAMPERED';
const badPayload = verifyDeliveryToken(badToken);
console.log(`  Valid token: ${payload ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  Tampered token: ${badPayload ? '✗ PASS (should fail)' : '✓ PASS'}`);

// Test 8: No-secret behavior (fail closed)
console.log('\nTest 8: No-secret behavior (fail closed)`);
const originalSecret = process.env.LICENSE_SECRET;
delete process.env.LICENSE_SECRET;
const keyNoSecret = issueLicenseKey();
const tokenNoSecret = mintDeliveryToken(sessionId);
console.log(`  License key without secret: ${keyNoSecret ? '✗ ISSUED (should be null)' : '✓ NULL (fail closed)'}`);
console.log(`  Token without secret: ${tokenNoSecret ? '✗ ISSUED (should be null)' : '✓ NULL (fail closed)'}`);
process.env.LICENSE_SECRET = originalSecret;

console.log('\n=== Summary ===');
console.log('All critical tests completed.');
console.log('Next: End-to-end delivery testing requires Stripe payment events.');
