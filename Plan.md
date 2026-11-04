# MT Personal Agent — Implementation plan v3.1

v3.1 ধাপ: দুই uploaded source-এর backend/rules/admin flow পড়া → site profiles → bridge invariants/tests → agent discovery/probe → source-aware installer/overlays → local tests → deploy ও secret configuration বাকি। Target site production audit/full mobile build সম্পন্ন দাবি নয়।


## বাস্তবায়িত ও local যাচাই

- [x] Owner auth, server-only schema, draft version/locking/recovery baseline।
- [x] পরিবর্তনযোগ্য brain/model/memory/tools/limits; durable command jobs ও bounded real tool loop।
- [x] Daily/weekly routines, timezone, deterministic occurrence, pause/version invalidation, scheduled pulse/background worker।
- [x] Evidence-linked reports, versioned correction, explicit disconnected/partial coverage।
- [x] Gmail OAuth/encrypted refresh, signed WhatsApp event ingestion, authorized personal-post reader।
- [x] Business social text/photo queue, image generation/upload, Facebook/Instagram API adapters।
- [x] Website bridge adapter, explicit resource/field maps, replay/idempotency protection।
- [x] Repository read/single-file PR, required CI merge gate, optional exact-commit Netlify monitoring।
- [x] Mobile navigation and forms, logout cleanup, build-time executable blueprint contract।

Build validates six contracts, JS syntax (including website adapter), JSON, HTML IDs/element references/PWA assets and runs node:test. Tests cover mocked backend/DOM behavior; these are not real-provider or device tests. Final test count is the build output, not a permanent promise in this file.

Local handoff evidence: agent build ৮৭ passed; MT Studio bridge+selected security/payment ১৭ passed; Golapi bridge ৩ passed, ৩ MT-only skipped। Target production build/dependency install pending; offline npm cache missing dependency, live services not exercised।

## চালু করার বাকি কাজ

- [ ] Agent-এর private repository/Netlify production deploy এবং env secrets।
- [ ] Firebase Auth owner, Firestore rules/composite indexes, Storage bucket/billing।
- [ ] Gmail Web OAuth client, exact callback, owner consent; refresh-token lifecycle পরীক্ষা।
- [ ] WhatsApp Business app number-এর supported Platform/coexistence onboarding, Meta webhook subscription; actual inbound/echo/history coverage পরীক্ষা।
- [ ] Meta Page/Instagram/own-post IDs, tokens, permissions; DRY_RUN থেকে actual controlled test।
- [x] আপলোড করা MT Studio/Golapi source-এর backend/admin/schema ধরে typed adapters, installer, dependency lock, website CI ও mock invariant tests।
- [ ] দুই target site-এর নতুন source deploy, bridge secrets, actual database actions এবং পূর্ণ hosted build/device validation।
- [ ] Exact CI checks, scoped GitHub token, branch protections, optional Netlify deploy integration live test।
- [ ] মালিকের timezone/time ও routine commands নির্ধারণ; যথাযথ autonomy flags চালু।
- [ ] Deployed Node 22 build, ফোন বন্ধ রেখে routine, real provider errors ও Android/iPhone visual/PWA পরীক্ষা।

## পরিবর্তনের নিয়ম

প্রথমে ছয় blueprint-এ scope/schema/flow বদলান, তারপর backend/tests, তারপর UI binding। Build green করে generated contract/CSS প্যাকেজে রাখুন। Prose আর code ভিন্ন হলে দুটো মিলিয়ে দিন; test বাদ দিয়ে gate pass নয়। Unknown write review ছাড়া retry নয়। নতুন user authorization পূর্বের generic restriction-এর উপরে প্রযোজ্য।

## Build contract

```json blueprint
{
  "buildScript": "node scripts/blueprints.mjs && node scripts/check.mjs && node --test",
  "requiredTestFiles": [
    "tests/api.test.mjs",
    "tests/ui.test.mjs",
    "tests/dependency.test.mjs",
    "tests/blueprints.test.mjs",
    "tests/agent.test.mjs",
    "tests/agent-media.test.mjs",
    "tests/site-bridge.test.mjs",
    "tests/agent-ui.test.mjs"
  ]
}
```
