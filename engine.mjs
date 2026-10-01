/*
 * engine.mjs - Core Automation Engine (v1 modules)
 * Reliable task scheduling, retry/backoff, profiles/cookies management,
 * session persistence, and human-like pacing configuration.
 */

import * as domain from './domain.mjs';

// ===== CONFIGURATION =====

/**
 * Human-like pacing configuration for task delays.
 */
export const Pacing = {
  minDelay: 800,
  maxDelay: 3200,
  jitterFactor: 0.3,
  multipliers: {
    login: 1.2,
    formFill: 1.0,
    navigation: 0.8,
    verification: 1.5,
    upload: 2.0,
    apiCall: 0.9,
    waitBetweenPages: 1.1
  }
};

/**
 * Retry policy for transient failures.
 */
export const RetryPolicy = {
  maxAttempts: 5,
  initialDelay: 500,
  multiplier: 2.0,
  jitter: 0.2,
  retryableStatuses: ['timeout', 'connection-error', 'api-error', 'rate-limit']
};

/**
 * Session state and cookies management.
 */
export class SessionManager {
  constructor(id = 'default') {
    this.id = id;
    this.cookies = [];
    this.profiles = new Map();
  }

  setCookie(cookie) {
    const existing = this.cookies.find(c => c.name === cookie.name);
    const merged = { ...cookie, lastUpdated: new Date().toISOString() };
    if (existing) Object.assign(existing, merged);
    else this.cookies.push(merged);
  }

  getCookie(name) {
    return this.cookies.find(c => c.name === name) ?? null;
  }

  setProfile(platform, profile) {
    this.profiles.set(platform, { ...profile, lastUsed: new Date().toISOString() });
  }

  getProfile(platform) {
    return this.profiles.get(platform) ?? null;
  }

  toJson() {
    return {
      id: this.id,
      cookies: this.cookies,
      profiles: Array.from(this.profiles.entries()).map(([k, v]) => ({ platform: k, ...v }))
    };
  }

  fromJson(json) {
    this.id = json.id ?? this.id;
    this.cookies = json.cookies ?? this.cookies;
    if (json.profiles?.length) {
      this.profiles = new Map(json.profiles.map(p => [p.platform, { ...p }]));
    }
  }
}

/**
 * Scheduler for recurring or delayed tasks.
 */
export class TaskScheduler {
  constructor(pacing = Pacing) {
    this.tasks = [];
    this.scheduledIds = new Set();
    this.pacing = pacing;
    this.running = false;
    this._loopHandle = null;
  }

  schedule(task) {
    if (this.scheduledIds.has(task.id)) return this.reschedule(task.id, task);
    this.tasks.push({ ...task, createdAt: new Date().toISOString(), status: 'ready' });
    this.scheduledIds.add(task.id);
    if (this.running) this._maybeRun(task);
    return task;
  }

  reschedule(id, updates) {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index >= 0) {
      const existing = this.tasks[index];
      Object.assign(existing, updates, { lastRescheduled: new Date().toISOString() });
      this.tasks[index] = existing;
    } else {
      this.schedule(updates);
    }
    return updates;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  clear() {
    this.stop();
    this.tasks = [];
    this.scheduledIds.clear();
  }

  _maybeRun(task) {
    if (task.nextRunAt == null || Date.now() >= task.nextRunAt) {
      this._runTask(task);
    }
  }

  async _loop() {
    while (this.running) {
      for (const task of this.tasks) this._maybeRun(task);
      const nextEvent = this.tasks
        .filter(t => t.status !== 'running' && t.nextRunAt != null)
        .reduce((min, t) => Math.min(min, t.nextRunAt), Infinity);
      const sleepMs = nextEvent === Infinity ? 2000 : Math.max(200, nextEvent - Date.now());
      await this._pacingDelay('waitBetweenPages', sleepMs);
    }
  }

  async _runTask(task) {
    const attemptTask = async attemptIdx => {
      const delay = this._backoffDelay(attemptIdx);
      await this._pacingDelay(task.pacingKey ?? 'apiCall', delay);
      return await task.handler(task.context);
    };
    let attempts = 0;
    let lastError = null;
    while (attempts < RetryPolicy.maxAttempts) {
      try {
        task.status = 'running';
        const result = await attemptTask(attempts);
        task.lastResult = result;
        task.status = result.status ?? 'success';
        task.lastRunAt = new Date().toISOString();
        if (task.recurring) {
          const interval = task.interval ?? 3600000;
          task.nextRunAt = Date.now() + interval;
        }
        return;
      } catch (err) {
        lastError = err;
        if (RetryPolicy.retryableStatuses.includes(err.status ?? 'api-error')) {
          attempts += 1;
          task.status = 'retrying';
          task.retryCount = attempts;
        } else {
          break;
        }
      }
    }
    if (lastError) {
      task.status = 'failed';
      task.lastError = lastError;
      task.retryCount = attempts;
    }
  }

  _pacingDelay(key = 'apiCall', baseMs) {
    const multiplier = this.pacing.multipliers[key] ?? 1.0;
    const jitter = (Math.random() * 2 - 1) * this.pacing.jitterFactor ?? 0;
    const delay = Math.floor(baseMs * multiplier * (1 + jitter));
    return new Promise(resolve => setTimeout(resolve, Math.max(this.pacing.minDelay ?? 800, delay)));
  }

  _backoffDelay(attempt) {
    const base = RetryPolicy.initialDelay * Math.pow(RetryPolicy.multiplier, attempt);
    const jitter = 1 + (Math.random() * 2 - 1) * RetryPolicy.jitter;
    return Math.floor(base * jitter);
  }

  async runOnce(id, context = {}) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    await this._runTask({ ...task, context });
  }
}

/**
 * Run a demo campaign using the engine.
 * @param {Object} options - Options to configure engine behavior
 * @returns {Promise<Object>} summary of the run
 */
export async function runDemo(options = {}) {
  const pacing = options.pacing ?? Pacing;
  const scheduler = new TaskScheduler(pacing);
  const session = new SessionManager(options.sessionId ?? 'demo-run');
  const results = { startedAt: new Date().toISOString(), tasksRun: 0, successCount: 0, failures: [] };

  scheduler.schedule({
    id: 'setup-profile',
    name: 'Setup demo profile',
    handler: async ctx => {
      session.setProfile(ctx.platform ?? 'demo', { username: 'alex.demo', plan: 'pro' });
      return { status: 'success', profile: session.getProfile(ctx.platform ?? 'demo') };
    },
    pacingKey: 'login'
  });

  scheduler.schedule({
    id: 'fetch-balance',
    name: 'Fetch provider balance',
    handler: async () => {
      await scheduler._pacingDelay('apiCall');
      return { status: 'success', balance: 12.50 };
    },
    pacingKey: 'apiCall'
  });

  scheduler.schedule({
    id: 'retry-failure-demo',
    name: 'Simulated retryable failure',
    handler: async () => {
      const counted = session.getCookie('retryDemoDone');
      if (!counted) {
        session.setCookie({ name: 'retryDemoDone', value: 'true' });
        throw { status: 'rate-limit', message: 'Simulated rate limit' };
      }
      return { status: 'success', details: 'Post-retry success' };
    },
    pacingKey: 'verification'
  });

  scheduler.schedule({
    id: 'cleanup',
    name: 'Finalize session',
    handler: async () => {
      const payload = session.toJson();
      return { status: 'success', session: payload };
    },
    pacingKey: 'upload'
  });

  scheduler.start();
  await scheduler._pacingDelay('waitBetweenPages', 100);
  await scheduler.runOnce('retry-failure-demo');
  const finalDelay = pacing.maxDelay * 2;
  await scheduler._pacingDelay('waitBetweenPages', finalDelay);
  scheduler.stop();

  for (const t of scheduler.tasks) {
    results.tasksRun += 1;
    if (t.status === 'success' || t.status === 'retrying') {
      results.successCount += 1;
    } else {
      results.failures.push({ id: t.id, status: t.status, message: t.lastError?.message ?? t.lastResult?.message ?? '' });
    }
  }

  results.endedAt = new Date().toISOString();
  return results;
}

/**
 * Extend the existing domain module with engine integration.
 */
export function extendDomain() {
  if (!domain.engine) domain.engine = { Scheduler: TaskScheduler, Session: SessionManager, Pacing, RetryPolicy };
}
