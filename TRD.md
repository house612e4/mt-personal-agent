# MT Personal Agent — Technical requirements v3.1

v3.1: adapters/site-bridge engine + source-specific overlay installer। MT Studio-এর existing pure TS validators Netlify esbuild bundle-এ reuse; Golapi root-এ pinned firebase-admin 14.5.0 ও lock লাগবে। Bridge target authentication HMAC; মানুষের session/MFA ব্যবস্থা অপরিবর্তিত।


## স্থির stack

Vanilla ES modules frontend/PWA; Netlify Node Functions; Firebase Authentication, server-only Firestore, ঐচ্ছিক Firebase Storage। package.json version 3.1.0। Exact SDK/override versions ও deployment directories নিচের machine block-এ; package-lock.json authoritative। Build target Node 22+, বর্তমান v3 local automated validation Node 24-এ হয়েছে; Node 22 ও hosted build validation বাকি।

## runtime ও API

- api.mjs: আগের owner-authenticated drafts/AI/Meta/manual publication।
- agent.mjs: owner-authenticated command/state/jobs/brain/routine/report/trace/cancel/retry/upload/Gmail connect।
- worker-background.mjs: INTERNAL_WORKER_SECRET bearer, durable job claim ও bounded execution; public unauthenticated execution নয়।
- pulse.mjs: Netlify schedule */5 * * * *, production deployment-এ provider activation প্রয়োজন। Stale running >২০ মিনিট uncertain।
- gmail-oauth.mjs: signed expiring one-time OAuth state, readonly Gmail consent, encrypted refresh token।
- whatsapp-webhook.mjs: Meta verification + raw-body HMAC, exact phone ID filtering ও provider-event deduplication।
- adapters/site-bridge/: actual source-based engine ও installer দিয়ে দুই target website-তে deploy; নিজের database account, HMAC/nonces, capability allowlist, revision-bound typed mutation ও atomic operation/audit। Agent site-এ রাখলেই target website সংযুক্ত হয় না।

OpenAI Responses API-তে bounded function loop, parallel_tool_calls false, tool allowlist ও untrusted-source instruction boundary। Tools একবারে একটি, AI incomplete response reject। Images API → JPEG → Firebase Storage URL; model editable। Default image model gpt-image-1.5; account access/quota live যাচাই বাকি। প্রতিটি Responses call quota reserve করে; image budget আলাদা; provider error হলেও reserved budget ফেরত দেওয়া হয় না।

GitHub REST: configured repo-তে read/tree, conditional SHA file update, agent branch ও PR; exact configured CI check names-এর latest run success এবং head SHA মিলে squash merge। Netlify REST-এ exact merge commit-এর ready deploy দেখে ফল; deploy trigger existing Git integration-এর উপর নির্ভরশীল। CI command নিজে চালানোর দাবি নয়।

## configuration

.env.example এবং GUIDE-BN.md-এ environment variables ও activation ধাপ। Secrets শুধু server-side। Agent worker/encryption, owner auth, Gmail OAuth, Meta, Storage, site bridges, repository CI এবং optional Netlify monitoring স্বাধীন configuration। Firestore composite indexes deploy করতে হবে। Client reads/writes deny rules। কোনো live credential প্যাকেজে নেই।

Remote request timeout, worker max-step/batch bound, shared ১০-minute deadline-এ ৫ মিনিটের কম বাকি থাকলে নতুন ধাপ শুরু বন্ধ এবং uncertain-write handling বজায় থাকবে। কোনো provider থেকে সব data পাওয়া বা ১০০% কাজ সফল হবে ধরে নেওয়া যাবে না। Empty/disconnected/partial coverage explicitly report করতে হবে।

## Build contract

```json blueprint
{
  "firebaseAdmin": "14.5.0",
  "firebaseWebSdk": "11.10.0",
  "globOverride": "14.0.3",
  "nodeMajor": 22,
  "publishDirectory": "public",
  "functionsDirectory": "netlify/functions"
}
```
