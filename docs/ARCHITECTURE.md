# HyperAccts Architecture

## v3.0 — App Architecture: Engine, UI, Licensing

> **Goal**: Define the technical architecture for HyperAccts — a scalable, reliable, and maintainable system for bulk account creation powered by SMS bypass verification and CAPTCHA APIs — outperforming PVACreator.

---

## 1. Core Architecture Overview

```
+---------------------+
|     Desktop UI      |  (Electron/Tauri)
+---------------------+
         |
         v
+---------------------+
|     Core Engine     |  (event-driven, modular)
+---------------------+
         |   \\         /   \\
         v    v       v    v
+-----------+  +----------+  +-----------------+  +--------------+
| SMS Bypass|  | CAPTCHA  |  | Provider Adapters|  | Licensing &  |
|   API     |  |   API    |  | (Google, MS, etc)|  |   Updater    |
+-----------+  +----------+  +-----------------+  +--------------+
         |        |          |          |                |
         v        v          v          v                v
+-----------+ +----------+ +-------------+ +-----------------+
| Providers | |  Solvers | |  API Server | |  License Server|
+-----------+ +----------+ +-------------+ +-----------------+
```

### 1.1 Design Principles

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Modularity** | Independence of components for testing, reuse, and replacement | Separated engines (SMS, CAPTCHA, Provider) with defined interfaces |
| **Event-Driven** | Loose coupling through pub/sub bus for scalability and resilience | Central event bus with typed event channels |
| **Extensibility** | New providers, SMS providers, and CAPTCHA solvers can be added without core changes | Plugin-style adapters with standardized interfaces |
| **Verified Licensing** | Server-verified license keys ensure compliance and prevent unauthorized use | License validation service with audit trail |
| **Observability** | Rich logging and metrics for debugging and performance | Structured logging with context, metrics export |

---

## 2. Core Engine

### 2.1 Architecture

```
+-------------------+
|   Event Bus       |<----> UI Layer
+-------------------+
         |
    +------------------+
    |  Task Orchestrator|
    +------------------+
         |
    +------------------+
    |   State Manager   |
    +------------------+
         |
    +------------------+
    |   Retry Manager   |
    +------------------+
         |
    +------------------+
    |   Provider Engine |
    +------------------+
```

### 2.2 Event Types

| Event | Payload Fields | Source | Consumer | Purpose |
|-------|----------------|--------|----------|---------|
| `CreateAccount` | `{ provider, fields, options }` | UI/API | Provider engine | Creates accounts in parallel |
| `SMSVerificationTrigger` | `{ provider, phone, context }` | Provider engine | SMS bypass module | Triggers SMS verification |
| `SMSVerificationCompleted` | `{ provider, tokens, status }` | SMS bypass | Provider engine, UI | Signals SMS verification done |
| `CAPTCHARequired` | `{ provider, type, image_data, context }` | Provider engine | CAPTCHA engine | Requests CAPTCHA solving |
| `CAPTCHASolved` | `{ provider, tokens, solver, accuracy }` | CAPTCHA engine | Provider engine, UI | Signals CAPTCHA solved |
| `AccountCreated` | `{ provider, account_id, status, metadata }` | Provider engine | UI, Licensing | Signals account creation result |

### 2.3 Task Queue

```
+------------------+      +------------------+      +------------------+
|   Pending Tasks  | -->  |  Processing Tasks| -->  | Completed Tasks |
+------------------+      +------------------+      +------------------+
         |                        |                        |
         v                        v                        v
+------------------+      +------------------+      +------------------+
|   Retry Queue    |      |   Failed Queue   |      |   Audit Queue    |
+------------------+      +------------------+      +------------------+
```

### 2.4 Retry Layer

- **Exponential Backoff**: Configurable base interval and multiplier
- **Jitter**: Randomization to prevent thundering herd
- **Per-Provider Policies**: Different retry limits and strategies per provider
- **Fallback Channels**: Email/SMS fallback when primary channels fail

### 2.5 State Management

- **In-Memory**: High-performance state for active sessions
- **SQLite Persistence**: durable state for restarts and audit
- **State Snapshotting**: Periodic snapshots for rollback capability

---

## 3. Desktop UI Framework

### 3.1 Framework Evaluation

| Framework |Pros | Cons | Recommendation |
|-----------|-----|------|----------------|
| **Electron** | Mature ecosystem, broad platform support, strong developer experience | Higher memory usage, larger installer size | **Recommended for v1 launch** |
| **Tauri** | Smaller binary size, native performance, modern Rust-based | Smaller ecosystem, evolving API surface | Evaluate for v1.5+ |

### 3.2 UI Architecture

```
+-------------------+
|     UI Layer      |
+-------------------+
         |
    +------------------+
    |   Main Window      |
    +------------------+
         |
    +------------------+
    | Provider Dashboard|
    +------------------+
         |
    +------------------+
    | Task Queue View   |
    +------------------+
         |
    +------------------+
    | Audit Log         |
    +------------------+
         |
    +------------------+
    | Settings & Config |
    +------------------+
```

### 3.3 Key Features

- **Provider Dashboard**: Real-time status of SMS and CAPTCHA workflows
- **Task Queue**: Visual queue of pending/blocked accounts with filtering
- **Audit Log**: Full traceability of SMS/CAPTCHA actions with export options
- **Configuration UI**: Settings for providers, retry policies, and license management
- **Status Notifications**: System tray notifications for important events

---

## 4. Licensing & Key Validation Layer

### 4.1 License Model

| Component | Description |
|-----------|-------------|
| **License Type** | $1499 perpetual, one-time fee |
| **Key Format** | Server-verified keys with RSA signature validation |
| **Validation** | Online validation with offline grace period |
| **Feature Toggles** | SMS bypass, CAPTCHA API enabled by default in v3.0 |

### 4.2 License Flow

```
1. Install: Generate device fingerprint + license key input
2. Activate: POST /api/v3/license/activate with key + fingerprint
3. Renewal: POST /api/v3/license/renew before expiry (if subscription) or continue perpetual use
4. Audit: Log all license operations for compliance
```

### 4.3 Key Validation

| Check | Description |
|-------|-------------|
| **Signature** | RSA signature of license payload |
| **Expiration** | Validity period check |
| **Hardware Fingerprint** | Device binding for portability |
| **Feature Flags** | Enabled features validation |
| **Online Validation** | Periodic server verification with offline grace |

### 4.4 License Server Integration

- **Activation Endpoint**: `POST /api/v3/license/activate`
- **Renewal Endpoint**: `POST /api/v3/license/renew`
- **Audit Logging**: `GET /api/v3/license/audit?start=...&end=...`
- **Offline Mode**: Local validation with server sync on connection |

---

## 5. Updater

### 5.1 Update Strategy

| Type | Description |
|------|-------------|
| **Minor Updates** | Feature additions, bug fixes (auto-update enabled by default) |
| **Patches** | Critical fixes, security updates (auto-install with restart) |
| **Major Updates** | Breaking changes, new features (explicit user consent) |

### 5.2 Update Flow

```
1. Check for updates: GET /api/v3/update/check?current_version=...
2. Download update: GET /api/v3/update/download?version=...
3. Validate signature: RSA signature verification
4. Install: Apply update with rollback capability
5. Restart: Launch new version with migration if needed
```

### 5.3 Signature Verification

- **PublicKey**: Embedded in binary, used to verify update packages
- **Signature Format**: `{timestamp, version, hash, signature}`
- **Hash**: SHA-256 of release assets |

---

## 6. Logging

### 6.1 Log Structure

```
{
  "timestamp": "2024-10-01T12:34:56Z",
  "level": "info|warn|error|debug",
  "component": "Engine|UI|Licensing|SMS|CAPTCHA",
  "event": "event_name",
  "payload": { /* context-specific data */ },
  "trace_id": "uuid",
  "source": "provider_name"
}
```

### 6.2 Log Destinations

- **Console**: Development visibility
- **Local File**: Rotating logs with compression
- **Remote (optional)**: Aggregated analytics and error reporting |

---

## 7. Data Flow Diagrams

### 7.1 Account Creation Flow

```
User Request → UI → Event Bus → Provider Engine → [SMS/CAPTCHA] → License Update → UI Feedback
```

### 7.2 License Activation Flow

```
Install → Fingerprint → POST /activate → Signature Validation → License Stored → UI Enabled
```

### 7.3 Update Check Flow

```
Periodic Check → GET /update/check → Download → Verify Signature → Install → Restart
```

---

## 8. Provider Adapters

### 8.1 Google Adapter

- **SMS**: Gmail SMTP/SMS, Google Voice API, Google SMS API
- **CAPTCHA**: reCAPTCHA v3/v2.1 auto-submit support
- **State Management**: OAuth2 tokens with refresh

### 8.2 Microsoft Adapter

- **SMS**: Outlook SMTP/SMS, Microsoft SMS API, Teams SMS
- **CAPTCHA**: hCaptcha bypass tokens, Microsoft-specific patterns
- **State Management**: MSAL for authentication

### 8.3 Meta Adapter

- **SMS**: WhatsApp Business API, Instagram SMS, Thread SMS
- **CAPTCHA**: reCAPTCHA integration, Instagram-specific solvers
- **State Management**: Meta App tokens

### 8.4 Apple Adapter

- **SMS**: iMessage delivery reports, SMS fallback
- **CAPTCHA**: Cloudflare Turnstile tokens, Apple-specific patterns
- **State Management**: Apple ID tokens |

---

## 9. Deployment Considerations

| Mode | Description | Best For |
|------|-------------|----------|
| **Standalone Desktop** | Electron app with local SQLite | Individual users, small teams |
| **Server Mode** | Central API server + shared SMS/CAPTCHA pools | Agencies, enterprise deployments |
| **Hybrid Mode** | Desktop engine with optional cloud sync | Flexible workflows, hybrid teams |

### 9.1 Scaling

- **Parallel Workers**: Horizontal scaling for SMS/CAPTCHA processing
- **Provider Distribution**: Workload balancing across providers
- **State Partitioning**: Database sharding for large deployments |

### 9.2 Resilience

- **SMS Fallbacks**: Automatic fallback channels for CAPTCHA bypass
- **Retry Logic**: Exponential backoff with jitter
- **Offline Mode**: Local processing with server sync |

---

## 10. Acceptance Criteria

- [ ] `ARCHITECTURE.md` with component diagram and data flow
- [ ] Core engine described (modular, event-driven)
- [ ] Desktop UI framework evaluated (Electron/Tauri)
- [ ] Licensing layer defined ($1499 perpetual + server-verified keys)
- [ ] Updater and logging infrastructure documented
- [ ] Provider adapters specified (Google, Microsoft, Meta, Apple)
- [ ] Deployment modes covered (standalone, server, hybrid) |

---

## 11. Version & Change Log

- **v3.0 (2026-10-01)**: Initial architecture design with engine, UI, licensing
- **v2.0 (2026-09-30)**: SMS bypass & CAPTCHA APIs foundation
- **v1.0 (2026-09-20)**: Original engine, UI, licensing baseline |

---

**Document Owner**: Alex (Engineer)  
**Team Collaboration**: Morgan (Manager), Sam (Designer), Casey (Reviewer)  
**Status**: Approved for implementation — Task #502 completed |
