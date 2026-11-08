# MT Personal Agent — Technical requirements v6.0

web-push dependency দিয়ে server VAPID Web Push পাঠাবে এবং সাময়িক failure সর্বোচ্চ তিনবার retry হবে। API success-এর সঙ্গে processing শেষ হওয়া আলাদা করে দেখা হবে। ছবি সর্বোচ্চ ১০ MB ও ভিডিও সর্বোচ্চ ১০০ MB signed raw upload দিয়ে Storage-এ যাবে; মূল ফাইল রূপান্তর হয় না।

নতুন chat.mjs আধুনিক Netlify default Request/Response handler, Firestore document listener দিয়ে SSE পাঠাবে। worker আলাদা থাকবে, ব্রাউজার বন্ধ হলেও ফল durable থাকবে। OpenAI stream parser completed event ছাড়া সফলতা গ্রহণ করবে না।

এই সংশোধনে নতুন provider call যোগ হয় না। Netlify-এর hosting badge বন্ধ করতে Project configuration > General > Powered by Netlify badge সেটিং লাগে। Browser translation-এর UI browser নিয়ন্ত্রণ করে।

v3.1: adapters/site-bridge engine + source-specific overlay installer। MT Studio-এর existing pure TS validators Netlify esbuild bundle-এ reuse; Golapi root-এ pinned firebase-admin 14.5.0 ও lock লাগবে। Bridge target authentication HMAC; মানুষের session/MFA ব্যবস্থা অপরিবর্তিত।


## স্থির stack

Vanilla ES modules chat-first frontend/PWA; Netlify Node Functions; Firebase Authentication, server-only Firestore ও Firebase Storage। package.json version 6.0.0। Exact SDK/override versions ও deployment directories নিচের machine block-এ; package-lock.json authoritative। Build target Node 22+; hosted production validation deployment checklist অনুযায়ী হবে।

## runtime ও API

- api.mjs: আগের owner-authenticated drafts/AI/Meta/manual publication।
- agent.mjs: owner-authenticated chat command/state/jobs/brain/routine/report/trace/cancel/retry/signed media upload/Gmail connect/live verification। Attachment-এর উপস্থিতি টেক্সট হিসেবে model-কে জানানো হয়। মূল bytes Storage-এ যায় এবং পোস্টে server সরাসরি সেই URL ব্যবহার করে।
- worker-background.mjs: INTERNAL_WORKER_SECRET bearer, durable job claim ও bounded execution; public unauthenticated execution নয়।
- pulse.mjs: Netlify schedule */5 * * * *, production deployment-এ provider activation প্রয়োজন। Stale running >২০ মিনিট uncertain।
- gmail-oauth.mjs: signed expiring one-time OAuth state, Gmail modify consent, encrypted refresh token। Gmail connector search/read/send/mark-read/archive সমর্থন করে; পুনরায় consent প্রয়োজন।
- Responses API reasoning effort low/medium/high, সর্বোচ্চ ১২ tool ধাপ এবং ২৫,০০০ output/reasoning token budget ব্যবহার করে। Durable memory Firestore থেকে command অনুযায়ী সীমিত context নেয়।
- whatsapp-webhook.mjs: raw-body HMAC, exact phone ID, owner number ও inbound text যাচাই। Audit events ও command jobs আলাদা স্থায়ী ID-তে deduplicate হয়।
- telegram-webhook.mjs: বাধ্যতামূলক webhook secret, ব্যক্তিগত owner chat এবং প্রেরক যাচাই। Worker বর্তমান সেটআপের owner recipient মিলিয়েই ফল পাঠায়।
- Agent calendar action শুধু মালিকের মাসের জন্য queued posts ও active routines পড়ে।
- adapters/site-bridge/: actual source-based engine ও installer দিয়ে দুই target website-তে deploy; নিজের database account, HMAC/nonces, capability allowlist, revision-bound typed mutation ও atomic operation/audit। Agent site-এ রাখলেই target website সংযুক্ত হয় না।

OpenAI Responses API-তে bounded function loop, parallel_tool_calls false, tool allowlist ও untrusted-source instruction boundary। Tools একবারে একটি, AI incomplete response reject। প্রতিটি Responses call quota reserve করে এবং স্থায়ী credit rule মেনে চলে। পোস্ট, রুটিন ও রিপোর্টের ফল থেকে server সরাসরি উত্তর দেয়। আরও তথ্য পড়ার প্রয়োজন হলে bounded tool loop চলে।

GitHub REST: configured repo-তে read/tree, conditional SHA file update, agent branch ও PR; বর্তমান নির্দেশে merge চাইলে ও অনুমতি থাকলে exact configured CI check names-এর latest run success এবং head SHA মিলে squash merge। Netlify REST-এ exact merge commit-এর ready deploy দেখে ফল; deploy trigger existing Git integration-এর উপর নির্ভরশীল। CI command নিজে চালানোর দাবি নয়।

## configuration

.env.example এবং GUIDE-BN.md-এ environment variables ও activation ধাপ। Secrets শুধু server-side। Agent worker/encryption, owner auth, Gmail OAuth, Meta, Storage, site bridges, repository CI এবং optional Netlify monitoring স্বাধীন configuration। Firestore composite indexes deploy করতে হবে। Client reads/writes deny rules। কোনো live credential প্যাকেজে নেই।

Remote request timeout, worker max-step/batch bound, shared ১০-minute deadline-এ ৫ মিনিটের কম বাকি থাকলে নতুন ধাপ শুরু বন্ধ এবং uncertain-write handling বজায় থাকবে। কোনো provider থেকে সব data পাওয়া বা ১০০% কাজ সফল হবে ধরে নেওয়া যাবে না। Empty/disconnected/partial coverage explicitly report করতে হবে।

## Build contract

```json blueprint
{
  "firebaseAdmin": "14.5.0",
  "webPush": "4.0.0",
  "firebaseWebSdk": "11.10.0",
  "globOverride": "14.0.3",
  "nodeMajor": 22,
  "publishDirectory": "public",
  "functionsDirectory": "netlify/functions"
}
```
