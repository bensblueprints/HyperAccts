/*
 * engine.test.mjs - Core Engine tests
 * Run with: node tests/engine.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskScheduler, SessionManager, Pacing, RetryPolicy, runDemo, extendDomain} from '../engine.mjs';

test('session manager persists cookies and profiles', () => {
  const session = new SessionManager('test-session');
  session.setCookie({ name: 'token', value: 'abc123', path: '/', maxAge: 86400 });
  session.setProfile('demo-platform', { username: 'demo.user', plan: 'starter' });
  assert.equal(session.getCookie('token').value, 'abc123');
  assert.deepEqual(session.getProfile('demo-platform').username, 'demo.user');
  const payload = session.toJson();
  assert.ok(payload.cookies.some(c => c.name === 'token'));
  assert.ok(payload.profiles.some(p => p.platform === 'demo-platform'));
  const restored = new SessionManager();
  restored.fromJson(payload);
  assert.equal(restored.getCookie('token')?.value, 'abc123');
  assert.equal(restored.getProfile('demo-platform')?.username, 'demo.user');
});

test('task scheduler respects pacing and run sequence', async () => {
  const scheduler = new TaskScheduler({
    minDelay: 200,
    maxDelay: 500,
    jitterFactor: 0.2,
    multipliers: { test: 1.1 }
  });
  const events = [];
  scheduler.schedule({
    id: 'first',
    name: 'First task',
    handler: async () => {
      events.push('first-start');
      await scheduler._pacingDelay('test', 100);
      events.push('first-end');
      return { status: 'success' };
    }
  });
  scheduler.schedule({
    id: 'second',
    name: 'Second task',
    handler: async () => {
      events.push('second-start');
      return { status: 'success' };
    },
    nextRunAt: Date.now() + 50
  });
  scheduler.start();
  await new Promise(resolve => setTimeout(resolve, 400));
  scheduler.stop();
  assert.equal(events.indexOf('first-start'), 0);
  assert.ok(events.indexOf('first-end') > events.indexOf('first-start'));
  assert.ok(events.indexOf('second-start') >= events.indexOf('first-end'));
});

test('task scheduler applies exponential backoff on retries', async () => {
  const scheduler = new TaskScheduler(Pacing);
  let attemptCount = 0;
  scheduler.schedule({
    id: 'retry-demo',
    name: 'Retry demo',
    handler: async () => {
      attemptCount += 1;
      if (attemptCount < 3) throw { status: 'rate-limit', message: 'Simulated rate limit' };
      return { status: 'success' };
    },
    pacingKey: 'apiCall'
  });
  scheduler.start();
  await new Promise(resolve => setTimeout(resolve, 300));
  scheduler.stop();
  const task = scheduler.tasks.find(t => t.id === 'retry-demo');
  assert.ok(task);
  assert.ok(task.retryCount >= 2);
  assert.equal(task.status, 'success');
});

test('demo run completes and persists session state', async () => {
  const result = await runDemo({ sessionId: 'demo-run-1', pacing: Pacing });
  assert.ok(result.startedAt);
  assert.ok(result.endedAt);
  assert.ok(result.tasksRun >= 2);
  assert.ok(result.successCount >= 1);
  assert.ok(Array.isArray(result.failures));
});

test('engine integration extends existing domain with scheduler and session', () => {
  const dom = { engine: null };
  extendDomain.call({ engine: dom.engine, ...dom });
  assert.ok(dom.engine, 'engine should be added');
  assert.ok(dom.engine.Scheduler, 'Scheduler should be added');
  assert.ok(dom.engine.Session, 'Session should be added');
  assert.ok(dom.engine.Pacing, 'Pacing should be added');
});
