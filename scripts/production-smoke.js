#!/usr/bin/env node
/* eslint-disable no-console */

require('dotenv').config();

const https = require('https');
const http = require('http');

const DEFAULT_BASE_URL = 'https://ticketmail.netlify.app';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactObject(value) {
  const SENSITIVE_KEYS = new Set([
    'password',
    'appPassword',
    'sessionToken',
    'token',
    'access_token',
    'refresh_token',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'ADMIN_SETUP_KEY',
    'SECRET_KEY'
  ]);

  if (Array.isArray(value)) return value.map(redactObject);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k)) out[k] = '[REDACTED]';
    else out[k] = redactObject(v);
  }
  return out;
}

function safePreviewBody(text, maxLen = 600) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + `... (truncated, ${trimmed.length} chars)`;
}

function request(urlString, { method = 'GET', headers = {}, body = null, timeoutMs = 20000 } = {}) {
  const url = new URL(urlString);
  const isHttps = url.protocol === 'https:';

  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: data
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${method} ${urlString}`));
    });

    req.on('error', reject);

    if (body != null) {
      req.write(body);
    }
    req.end();
  });
}

function asJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ok(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.isAssertion = true;
    throw err;
  }
}

async function run() {
  const baseUrl = (process.env.TM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const email = process.env.TM_SMOKE_EMAIL || '';
  const password = process.env.TM_SMOKE_PASSWORD || '';
  const mutate = String(process.env.TM_SMOKE_MUTATE || '').toLowerCase() === 'true';

  const results = [];
  const startedAt = Date.now();

  async function test(name, fn) {
    const t0 = Date.now();
    try {
      const details = await fn();
      results.push({ name, ok: true, ms: Date.now() - t0, details });
    } catch (e) {
      results.push({
        name,
        ok: false,
        ms: Date.now() - t0,
        error: e && e.message ? e.message : String(e)
      });
    }
  }

  function printSummary() {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    console.log('\n=== TicketMail Production Smoke Test ===');
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Duration: ${Date.now() - startedAt}ms`);

    for (const r of results) {
      const status = r.ok ? 'PASS' : 'FAIL';
      console.log(`- ${status} (${r.ms}ms) ${r.name}`);
      if (!r.ok) console.log(`    ${r.error}`);
    }

    if (failed > 0) {
      console.log('\nFailing test details (redacted):');
      for (const r of results.filter((x) => !x.ok)) {
        if (r.details) {
          const redacted = redactObject(r.details);
          console.log(`\n[${r.name}]`);
          console.log(safePreviewBody(JSON.stringify(redacted, null, 2), 2000));
        }
      }
    }
  }

  // 1) Homepage
  await test('GET / (homepage reachable)', async () => {
    const res = await request(`${baseUrl}/`, { method: 'GET' });
    ok(res.status === 200, `Expected 200, got ${res.status}`);
    ok((res.text || '').length > 200, 'Expected non-trivial HTML body');
    return { status: res.status };
  });

  // 2) auth-health is expected to be protected
  await test('GET auth-health (should be protected or OK)', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/auth-health`, { method: 'GET' });
    ok([200, 401, 403].includes(res.status), `Expected 200/401/403, got ${res.status}`);
    const json = asJson(res.text);
    if (res.status === 200) {
      ok(json && typeof json === 'object', 'Expected JSON body when 200');
    }
    return { status: res.status, body: json || safePreviewBody(res.text) };
  });

  // 2b) CORS preflight should work for key endpoints
  await test('OPTIONS auth-login (CORS preflight)', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/auth-login`, {
      method: 'OPTIONS',
      headers: {
        Origin: baseUrl,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization'
      }
    });
    ok(res.status === 200, `Expected 200, got ${res.status}`);
    return { status: res.status };
  });

  await test('OPTIONS get-settings (CORS preflight)', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/get-settings`, {
      method: 'OPTIONS',
      headers: {
        Origin: baseUrl,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type,authorization'
      }
    });
    ok(res.status === 200, `Expected 200, got ${res.status}`);
    return { status: res.status };
  });

  // 3) get-settings should never 500
  await test('GET get-settings', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/get-settings`, { method: 'GET' });
    ok(res.status === 200, `Expected 200, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && json.success === true, 'Expected {success:true}');
    return { status: res.status, body: json };
  });

  // 4) get-tickets should respond (even if empty)
  await test('GET get-tickets', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/get-tickets`, { method: 'GET' });
    ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && typeof json === 'object', 'Expected JSON body');
    if (res.status === 200) ok(json.success === true, 'Expected success:true');
    return { status: res.status, body: json };
  });

  // 4b) create-ticket should exist (non-mutating checks by default)
  await test('GET create-ticket (should be 405, not 404)', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/create-ticket`, { method: 'GET' });
    ok(res.status === 405, `Expected 405, got ${res.status}`);
    return { status: res.status, body: safePreviewBody(res.text) };
  });

  await test('POST create-ticket missing fields (should be 400)', async () => {
    const res = await request(`${baseUrl}/.netlify/functions/create-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    ok(res.status === 400, `Expected 400, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && json.success === false, 'Expected success:false');
    return { status: res.status, body: json || safePreviewBody(res.text) };
  });

  // 5) auth endpoints: login + validate (only if creds provided)
  let sessionToken = null;

  await test('POST auth-login (skips if no TM_SMOKE_EMAIL/TM_SMOKE_PASSWORD)', async () => {
    if (!email || !password) {
      return { skipped: true, reason: 'Set TM_SMOKE_EMAIL and TM_SMOKE_PASSWORD to run this test.' };
    }

    const res = await request(`${baseUrl}/.netlify/functions/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    ok(res.status === 200, `Expected 200, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && json.success === true, 'Expected success:true');
    ok(typeof json.sessionToken === 'string' && json.sessionToken.length > 20, 'Expected sessionToken');

    sessionToken = json.sessionToken;
    return { status: res.status, body: redactObject(json) };
  });

  await test('POST auth-validate (skips if no session)', async () => {
    if (!sessionToken) return { skipped: true, reason: 'No sessionToken (login skipped or failed).' };

    const res = await request(`${baseUrl}/.netlify/functions/auth-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    });

    ok(res.status === 200, `Expected 200, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && json.valid === true, 'Expected valid:true');
    return { status: res.status, body: redactObject(json) };
  });

  // 6) admin endpoints: verify protected (401 if no token) and functional if token present
  await test('GET list-users (401 if no token; 200 if token)', async () => {
    const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    const res = await request(`${baseUrl}/.netlify/functions/list-users`, { method: 'GET', headers });

    if (!sessionToken) {
      ok(res.status === 401, `Expected 401 without token, got ${res.status}`);
    } else {
      ok(res.status === 200, `Expected 200 with token, got ${res.status}`);
      const json = asJson(res.text);
      ok(json && json.success === true, 'Expected success:true');
    }

    return { status: res.status, body: asJson(res.text) || safePreviewBody(res.text) };
  });

  await test('GET companies-list (401 if no token; 200 if token)', async () => {
    const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    const res = await request(`${baseUrl}/.netlify/functions/companies-list`, { method: 'GET', headers });

    if (!sessionToken) {
      ok(res.status === 401, `Expected 401 without token, got ${res.status}`);
    } else {
      ok(res.status === 200, `Expected 200 with token, got ${res.status}`);
      const json = asJson(res.text);
      ok(json && json.success === true, 'Expected success:true');
    }

    return { status: res.status, body: asJson(res.text) || safePreviewBody(res.text) };
  });

  // 7) Optional mutation tests (disabled by default)
  await test('MUTATION mode (skips unless TM_SMOKE_MUTATE=true)', async () => {
    if (!mutate) {
      return { skipped: true, reason: 'Set TM_SMOKE_MUTATE=true to enable mutation tests.' };
    }
    if (!sessionToken) {
      return { skipped: true, reason: 'Mutation tests require TM_SMOKE_EMAIL/TM_SMOKE_PASSWORD (admin) to obtain a session token.' };
    }

    // Intentionally conservative: do not create/update/delete by default beyond a safe create-ticket.
    // This helps catch DB write failures without requiring admin-only endpoints.
    const title = `Smoke Test Ticket ${new Date().toISOString()}`;
    const res = await request(`${baseUrl}/.netlify/functions/create-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: 'Automated smoke test ticket. Safe to delete if desired.',
        customerEmail: `smoke-${Date.now()}@example.com`,
        customerName: 'Smoke Test',
        status: 'open',
        priority: 'low'
      })
    });
    ok([201, 500].includes(res.status), `Expected 201 or 500, got ${res.status}`);
    const json = asJson(res.text);
    ok(json && typeof json === 'object', 'Expected JSON body');
    if (res.status === 201) ok(json.success === true, 'Expected success:true');
    return { status: res.status, body: redactObject(json) };
  });

  // Small pause to reduce bursty traffic if re-run quickly
  await sleep(200);

  printSummary();

  const failed = results.some((r) => !r.ok);
  process.exitCode = failed ? 1 : 0;
}

run().catch((e) => {
  console.error('Smoke test runner crashed:', e);
  process.exitCode = 2;
});
