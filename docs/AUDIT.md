# PVA Creator audit — September 30, 2026

PVA Creator 6.8.5 was inspected on the owner's Windows computer. Local catalog evidence lists 213 entries, including platform variants. Catalog presence is not proof that an adapter works.

## Observed workflows

| Platform | Evidence | Key observed controls |
|---|---|---|
| Gmail | Wizard inspected; later steps partly observed | Proxy, identity, recovery email, SMS provider, IMAP/POP, phone/state outputs, 2-step settings, forwarding, app passwords, YouTube and password-related stages |
| YouTube | Mock campaign saved; never started | Proxy, username/password/recovery email, CAPTCHA, phone service/key/country, phone output |
| Outlook | Wizard inspected, mock campaign API create | Proxy, Outlook/Hotmail selection, username, identity, IMAP/POP, timeout, DOB, CAPTCHA, token |
| Facebook | Empty mock campaign saved; never started | Proxy, email/phone registration mode, email settings, CAPTCHA, phone, timeout, cookie, phone service, identity/DOB/gender, optional photo, 2-step settings |
| Amazon | Wizard inspected, draft not saved | Proxy, mailbox/server settings, SMS provider, CAPTCHA, name/password, optional address, address status, URL |
| Apple | Partial ordinary-account wizard inspection | Proxy, email, common/account fields, payment and phone stages; no verified developer enrollment module |
| Reddit / Instagram | Local catalog only | Full workflows and live behavior unverified |
| Google Play Console | No dedicated module verified | New product scope |

Blank-field conventions were inconsistent: Outlook's blank IMAP/POP setting enabled it while Gmail's blank setting disabled it. Some wizards allowed incomplete required fields through setup. A mock YouTube campaign unexpectedly inherited existing proxy settings. HyperAccts should replace these conventions with explicit controls, validation and clear connection selection.

Shared UI showed data import/paste/add/remove/clear, campaign start/pause/stop, exports, record counts, settings, proxies and fingerprint controls. These were not all exercised end to end.

## Legacy API

At the audited local endpoint, platform listing returned Outlook and Twitter available and Gmail_Bypass_QR_Code unavailable. Mock Outlook/Twitter campaign creation succeeded with Stop status. Campaign detail lookups worked. Account-list/add requests returned Campaign not found for these same mock campaigns; vendor documentation limits account APIs to Gmail, so this is a coverage limitation rather than evidence of complete API failure. Audited local calls did not require a key.

The audit used mock data; no registration campaign was started and no SMS/CAPTCHA purchases were made. Several mock campaigns remain in the legacy app with `UX_AUDIT_MOCK_` names. Some existing user configurations were present but are not copied into this repository.

## References

- [Vendor integration overview](https://www.pvacreator.com/en/openclaw-ai-browser-automation.html)
- [Vendor API reference repository](https://github.com/PVACreator/PVACreator-skills)
- [SMSPVA API documentation](https://docs.smspva.com/)
- [DaisySMS API documentation](https://daisysms.io/docs/api)
- [2Captcha API documentation](https://2captcha.com/api-docs)

Sanitized local catalog/API evidence: [audit-evidence.json](../audit-evidence.json).
