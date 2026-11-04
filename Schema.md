# MT Personal Agent — Schema v3.1

v3.1 site schema: MT Studio settings/brand, settings/policies, users, records, files, manualPayments, contests, competitions; Golapi orders, products, users, staff, setting, support_tickets এবং যাচাইকৃত ERP collections। _agent_operations, _agent_audit, _agent_nonces target database-এ। Raw update/delete নয়; data hash revision ও transaction।


Firestore document model; relational foreign key নেই। প্রত্যেক ব্যক্তিগত record owners/{OWNER_UID}-এর নিচে। Client rules সব read/write deny; verified owner API/Admin SDK কাজ করবে। ID API-তে validate হয়।

| collection/document | প্রধান data / invariant |
| --- | --- |
| config/brain | model, imageModel, instructions, memory, timezone, tools, flags, budgets, version; expectedVersion save |
| config/brain/history/{version} | manual brain-save-এর পুরোনো config; remember memory append-এ history snapshot হয় না |
| config/gmail | AES-GCM encrypted refresh token; key server env-এ |
| oauth/{nonce} | expiry, used; callback state replay বন্ধ |
| routines/{UUID} | title, command, HH:mm, timezone, days, enabled, allowWrites, version, nextRunAt |
| jobs/{UUID/hash} | kind, payload, status, runAt, routineId/version, allowWrites, created/started/finishedAt, result, polls |
| jobs/{id}/trace/{event} | tool, success/error, bounded result, timestamp |
| reports/{UUID} | title, body, evidence, version, createdAt/updatedAt |
| reports/{id}/history/{version} | আগের report ও evidence; stale writes বন্ধ |
| events/{hash} | phone-filtered WhatsApp webhook text/nontext/backfill metadata, receivedAt; duplicate provider event নয় |
| limits/agent-ai | UTC day + Responses call count |
| limits/agent-images | UTC day + image count |
| drafts/{id} | legacy account/text/version/state/publishing lock/outcome; version-bound publication |
| limits/ai | legacy draft-generation daily/rate quota |

Job claim transaction-এর final attempt-এর return value-ই worker পায়। Routine version check claim-এ হয়। Scheduling ID command/post content/time-ভিত্তিক; এক command-এর duplicate tool invocation একই queued post পায়। Queue delivery exact-time guarantee নয়; unknown external writes conservative uncertain থাকে।

firestore.indexes.json-এ jobs status/runAt এবং status/startedAt indexes। Website bridge-এর নিজস্ব database-এ _agent_nonces replay guard ও _agent_operations stable operation fingerprint/result রাখা হয়; capability profile-এ actual collection নাম/typed actions নির্ধারিত। _agent_audit-এ পরিবর্তনের পরিচয়; record hash revision stale writes বন্ধ করে। MT manualPaymentReceipts ও credit records এবং Golapi wallet/coupon/products একই transaction-এ সংশ্লিষ্ট ফল বদলায়। এসব records-এর lifecycle/retention production owner-কে নির্ধারণ করতে হবে।

নিচের machine block collection paths এবং পুরোনো draft API-এর pagination/body/AI caps-এ ব্যবহৃত; agent budgets PRD-এর agent policy ও editable brain থেকে আসে।

## Build contract

```json blueprint
{
  "paths": {
    "owners": "owners",
    "drafts": "drafts",
    "limits": "limits",
    "ai": "ai",
    "jobs": "jobs",
    "routines": "routines",
    "reports": "reports",
    "config": "config",
    "events": "events",
    "oauth": "oauth"
  },
  "pageSize": 50,
  "maxBodyLength": 16000,
  "aiMaxDaily": 100,
  "aiMinIntervalMs": 10000
}
```
