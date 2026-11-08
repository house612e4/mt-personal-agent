# আরমান v5.0.0

পূর্ণপর্দা চ্যাট, কথোপকথনভিত্তিক স্থায়ী স্মৃতি, reasoning model, দীর্ঘ tool execution, Gmail/WhatsApp/Telegram action, অপরিবর্তিত ছবি/ভিডিও পোস্ট এবং server-side Web Push রয়েছে।

মোবাইলের সহজ বাংলা chat থেকে কথা, ছবি, রুটিন, background কাজ এবং উৎসসহ রিপোর্ট। আরমানের চ্যাটে আজকের সংরক্ষিত কাজের হিসাব দেখায়। ছবি দিলে মূল ফাইল দিয়েই Facebook/Instagram পোস্ট কিউতে যায়। Netlify Functions + Firebase owner login/Firestore; বাস্তব provider adapters রয়েছে, account integration চালু করতে নিজের configuration দরকার।

- অনুমোদিত মালিকের WhatsApp Business ও Telegram চ্যাট থেকে লিখিত নির্দেশ এবং একই চ্যাটে উত্তর।
- রুটিনে মাসভিত্তিক অপেক্ষমাণ পোস্ট ও পরের রুটিন সময়।
- ব্যবসার Facebook/Instagram লেখা/ছবি ও queue scheduling।
- Gmail, সংগৃহীত WhatsApp Business events ও অনুমোদিত নিজের Facebook posts audit।
- দুই ওয়েবসাইটের configured records এবং repository PR/CI merge/Netlify deployment যাচাই।
- রিপোর্ট সংশোধন ও আগের version/evidence, per-tool trace, daily AI limits।
- পুরোনো manual drafts/publication editor retained।

**চালু করার ধাপ: [GUIDE-BN.md](GUIDE-BN.md)**। GitHub-এ ZIP-এর ভিতরের mt-personal-agent ফোল্ডারের contents repository root-এ দিন। package.json root-এ থাকতে হবে।

Node 22+, `npm ci`, `npm run build`, `.env.example` অনুযায়ী local configuration, `npm run dev`। Netlify Git deployment দরকার; public folder drag-and-drop-এ backend/scheduler তৈরি হবে না।

দুই সাইটের সংযোগের কোড adapters/site-bridge/ এবং স্থাপন করার script scripts/install-site-bridge.mjs-এ আছে। নিজের সাইটের বর্তমান source-এর ওপর installer চালানোর ধাপ GUIDE-BN.md-এ আছে।

Code editing-এর আগে [AGENTS.md](AGENTS.md) এবং [PRD.md](PRD.md), [AppFlow.md](AppFlow.md), [UI_Spec.md](UI_Spec.md), [TRD.md](TRD.md), [Schema.md](Schema.md), [Plan.md](Plan.md) পড়ুন। Build ছয়টি JSON blueprint পড়ে runtime contract/CSS বানায়; সব বাংলা prose স্বয়ংক্রিয়ভাবে enforce হয় না।

এই প্যাকেজে live credentials নেই। Gmail-এর full mail body/attachment, ফোনের সব WhatsApp chats, Facebook Messenger, arbitrary code execution, multi-file refactor বা payment gateway/refund কাজ implemented নয়। Source coverage ও pending activation Plan/Guide-এ আছে। Provider live, deployed Node 22 ও real mobile validation বাকি।

Structure: public/ mobile PWA; server/ agent/store/connectors; netlify/functions/ API/OAuth/webhook/worker/pulse; adapters/site-bridge/ source-specific bridge/installer; tests/ mocked integration/logic checks।
