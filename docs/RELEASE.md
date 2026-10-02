# HyperAccts Release Pipeline

## v1.0 — Build & Windows Installer Release Pipeline

> **Goal**: Define the complete release pipeline for HyperAccts Windows installer: code-signing, versioning, auto-update channels, artifact naming, and paid vs preview installer differentiation.

---

## 1. Overview

HyperAccts is a Windows desktop application built with Electron, distributed as NSIS installers and portable bundles. This document defines the release pipeline including build configuration, code signing, versioning strategy, and deployment workflows.

### 1.1 Current Status

- **Build System**: Electron Builder (v26.15.3) with NSIS for Windows
- **Build Command**: `npm run build:win`
- **Current Release**: v0.2.0 (produced with Electron Builder)
- **Distribution**: GitHub Releases and hyperaccts.com/downloads

---

## 2. Build System

### 2.1 Electron Builder Configuration

```json
{
  "appId": "com.hyperaccts.desktop",
  "productName": "HyperAccts",
  "directories": { "output": "dist" },
  "files": [
    "index.html",
    "styles.css",
    "*.mjs",
    "desktop/**",
    "docs/**",
    "README.md",
    "audit-evidence.json",
    "package.json"
  ],
  "win": {
    "icon": "desktop/icon.ico",
    "signAndEditExecutable": false
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "artifactName": "HyperAccts-Setup-${version}.${ext}"
  },
  "portable": {
    "artifactName": "HyperAccts-Portable-${version}.${ext}"
  }
}
```

### 2.2 Build Process

```bash
# Development
npm run desktop          # Electron app with local server at :4174
npm run website          # Public website preview at :4180

# Production Build
npm run build:win        # Electron Builder with NSIS installer + portable

# Output
dist/HyperAccts-Setup-X.Y.Z.exe    # Official installer
dist/HyperAccts-Portable-X.Y.Z.exe # Portable bundle
```

---

## 3. Versioning Strategy

### 3.1 Semantic Versioning

- **Format**: `MAJOR.MINOR.PATCH`
- **Release Type**: Pre-release (alpha/beta/rc) with stable releases
- **Version Sources**: 
  - Package.json (`"version"`)
  - Git tags (`vX.Y.Z`)
  - Installer metadata (embedded during build)

### 3.2 Pre-release Channels

| Channel | Suffix | Auto-Update Target | Use Case |
|---------|--------|-------------------|----------|
| **Stable** | *(none)* | All users | Production releases |
| **Beta** | `-beta.N` | Opt-in users | Feature previews |
| **Dev** | `-dev.N` | Engineering team | Daily builds |

### 3.3 Version Bump Process

1. **Commit Version**: Update `package.json` version field
2. **Git Tag**: Tag commit with `vX.Y.Z[-channel]`
3. **Build**: Run `npm run build:win`
4. **Release**: Upload artifacts to GitHub Releases

---

## 4. Code Signing

### 4.1 Signing Requirements

| Requirement | Specification |
|-------------|---------------|
| **Certificate Type** | Code Signing Certificate (EV or OV) |
| **Certificate Owner** | Owner-owned (dependency for production builds) |
| **Signing Tool** | `signtool` (Windows SDK) or `electron-builder` integration |
| **Timestamp Server** | Comodo (time.windows.com) or DigiCert |

### 4.2 Signing Process

```bash
# Sign installer executable
signtool sign /f "cert.pfx" /p "cert-password" /t "http://timestamp.digicert.com" /v "dist/HyperAccts-Setup-X.Y.Z.exe"

# Sign Portable executable
signtool sign /f "cert.pfx" /p "cert-password" /t "http://timestamp.digicert.com" /v "dist/HyperAccts-Portable-X.Y.Z.exe"

# Sign NSIS setup executable
signtool sign /f "cert.pfx" /p "cert-password" /t "http://timestamp.digicert.com" /v "dist/HyperAccts-Setup-X.Y.Z.exe"
```

### 4.3 Unsigned Preview vs Signed Paid Installers

| Characteristic | Preview (Unsigned) | Signed (Paid) |
|----------------|-------------------|---------------|
| **Certificate** | Self-signed or test cert | Owner-owned EV/OV cert |
| **Distribution** | GitHub Releases, internal testing | hyperaccts.com/downloads, direct customer delivery |
| **SmartScreen** | May show unknown publisher initially | Trusted publisher from first run |
| **Update Channel** | Beta/Dev with opt-in | Stable channel for production users |
| **Licensing Integration** | Available but delayed | Included at install time |

---

## 5. Artifact Naming

### 5.1 Installers

| Artifact | Pattern | Example |
|----------|---------|---------|
| **Installer** | `HyperAccts-Setup-${version}.exe` | `HyperAccts-Setup-0.2.0.exe` |
| **Portable** | `HyperAccts-Portable-${version}.exe` | `HyperAccts-Portable-0.2.0.exe` |
| **Update Package** | `HyperAccts-win32-${arch}-${version}.zip` | `HyperAccts-win32-x64-0.2.0.zip` |

### 5.2 Channels

| Channel | Installer Suffix | Artifact Example |
|---------|------------------|------------------|
| Stable | *(none)* | `HyperAccts-Setup-0.2.0.exe` |
| Beta | `-beta.N` | `HyperAccts-Setup-0.2.0-beta.1.exe` |
| Dev | `-dev.N` | `HyperAccts-Setup-0.2.0-dev.5.exe` |

---

## 6. Auto-Update Channel

### 6.1 Update Configuration

| Setting | Value |
|---------|-------|
| **Update Source** | GitHub Releases (primary), S3 (optional) |
| **Update Check Endpoint** | `GET /api/v1/update/check?current_version=X.Y.Z` |
| **Signature Verification** | RSA public key embedded in binary |
| **Auto-Update Enabled** | Yes (default for signed installers) |

### 6.2 Update Workflow

```
1. Release published to GitHub with artifact checksums
2. Electron app checks for updates periodically
3. If update available and signature verified, download package
4. Background download and installation
5. Restart required with upgrade prompt
```

### 6.3 Channel-Specific Update Behavior

| Channel | Auto-Update Enabled | Release Notes | Rollout Strategy |
|---------|---------------------|---------------|------------------|
| Stable | Yes (default) | Full changelog | Gradual (100% users) |
| Beta | Yes (opt-in) | Pre-release notes | 10-25% users |
| Dev | Yes (opt-in) | Commit highlights | Engineering team |

---

## 7. Release Process

### 7.1 Development → Release Pipeline

```
1. Development Branch → Feature complete
2. Version Bump → Update package.json version
3. QA Testing → Run test suite, user acceptance testing
4. Code Signing → Sign release artifacts with owner cert
5. Release Assets → Upload installers to GitHub + hyperaccts.com/downloads
6. Documentation → Update RELEASE.md with version changes
7. Deployment → Deploy to production hosting (if applicable)
```

### 7.2 Pre-release Checklist

- [ ] Version bump committed (`package.json`)
- [ ] Test suite passes (`npm test`)
- [ ] Desktop UI tested locally (`npm run desktop`)
- [ ] Build artifacts produced (`npm run build:win`)
- [ ] Signing certificate available (owner-owned for production)
- [ ] Documentation reviewed (`RELEASE.md`, `README.md`)

### 7.3 Release Checklist

- [ ] Git tag created (`vX.Y.Z[-channel]`)
- [ ] Installer and portable artifacts signed (if production)
- [ ] Checksums generated and published
- [ ] Release notes compiled (highlight changes, fixes, known issues)
- [ ] Artifact upload to GitHub Releases
- [ ] Download page updated on hyperaccts.com
- [ ] Auto-update channel configured

---

## 8. Future Enhancements

### 8.1 Planned Improvements

- **Self-Signing with Owner Certificate**: Automate signing with owner-owned cert
- **Channel-Specific Builds**: Different feature sets per channel (stable vs beta)
- **Auto-Update Backend**: Dedicated update server with analytics
- **Per-User vs Per-Machine Install**: NSIS multiplier (one-click vs manual install)
- **License Activation at Install**: Integrate license key input during NSIS setup

### 8.2 Integration Points

- **License Server**: `POST /api/v3/license/activate` for activation at install time
- **Account Inventory**: Sync installation count to license server
- **Analytics**: Anonymous usage data (opt-in) for product improvements

---

## 9. Acceptance Criteria

- [x] `RELEASE.md` defines complete build/release pipeline
- [x] Code-signing requirements documented (owner-owned cert as dependency)
- [x] Versioning strategy outlined (semantic versioning with channels)
- [x] Artifact naming conventions specified
- [x] Auto-update channel defined (GitHub Releases as primary source)
- [x] Paid vs preview installer differentiation documented

---

## 10. Notes

- **Owner Dependencies**: Code-signing certificate is owner-owned and required for production builds
- **Current Implementation**: v0.2.0 installers already published (see GitHub Releases and hyperaccts.com/downloads)
- **Build System**: Electron Builder (v26.15.3) with NSIS provides comprehensive Windows installer support

---

**Document Owner**: Alex (Engineer)  
**Team Collaboration**: Morgan (Manager), Sam (Designer), Casey (Reviewer)  
**Status**: Production-ready for Windows installer pipeline — Task #503 completed
