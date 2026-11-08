# MT Personal Agent — Implementation plan v5.0

জরুরি regression। অনুপস্থিত/খালি/null caption, বাস্তব Firestore shape validation, video processing resume, server push expired endpoint cleanup ও mobile/desktop layout render যাচাই।

নতুন regression-এ live stream quota, বিচ্ছিন্ন সংযোগে duplicate job রোধ, সত্যিকার Page source এবং cancelled status presentation যাচাই করতে হবে।

এই সংশোধনে কথোপকথনের history, পুরোনো সংযুক্ত ছবি রেফারেন্স এবং সাধারণ চ্যাটের উপস্থাপনার regression যাচাই করতে হবে।

v4.0 foundation: chat-first UI → অপরিবর্তিত ছবি সংযুক্তি → সংরক্ষিত আজকের কাজ → এক কমান্ডে একটি social queue handoff → live Facebook probe → mobile layout → automated validation। v5.0-এ reasoning, durable memory, communication actions, Instagram probe ও push test যোগ হয়েছে। Target provider production test সম্পন্ন দাবি নয়।


## বাস্তবায়িত ও local যাচাই

- [x] Owner auth, server-only schema, draft version/locking/recovery baseline।
- [x] পরিবর্তনযোগ্য brain/model/memory/tools/limits; durable command jobs ও bounded real tool loop।
- [x] Gmail search/read/send/mark-read/archive, WhatsApp text/template, Telegram send এবং explicit communication permission gate।
- [x] আলাদা durable memory records, relevance retrieval, reasoning depth ও ১২ ধাপের complex task loop।
- [ ] বাস্তব Google consent, Meta/Telegram credentials, ফোনে push এবং provider account-এ end-to-end controlled test।
- [x] Daily/weekly routines, timezone, deterministic occurrence, pause/version invalidation, scheduled pulse/background worker।
- [x] Evidence-linked reports, versioned correction, explicit disconnected/partial coverage।
- [x] Gmail OAuth/encrypted refresh, signed WhatsApp event ingestion, authorized personal-post reader।
- [x] Business social text/photo queue, অপরিবর্তিত image upload, Facebook/Instagram API adapters।
- [x] Website bridge adapter, explicit resource/field maps, replay/idempotency protection।
- [x] Repository read/single-file PR, required CI merge gate, optional exact-commit Netlify monitoring।
- [ ] WhatsApp Business ও Telegram-এ মালিকের লিখিত নির্দেশ এবং একই চ্যাটে ফল live পরীক্ষা।
- [x] Mobile navigation and forms, logout cleanup, build-time executable blueprint contract।

Build validates six contracts, JS syntax (including website adapter), JSON, HTML IDs/element references/PWA assets and runs node:test. Tests cover mocked backend/DOM behavior; these are not real-provider or device tests. Final test count is the build output, not a permanent promise in this file.

Local validation-এর ফল build output-এ পাওয়া যাবে। Target provider live calls, production deployment এবং actual Android/iPhone device test এখনো deploy-এর পরে করতে হবে।

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
    "tests/agent-ui.test.mjs",
    "tests/live-chat.test.mjs",
    "tests/push.test.mjs"
  ]
}
```
