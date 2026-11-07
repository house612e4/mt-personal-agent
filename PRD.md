# MT Personal Agent — PRD v4.0

নতুন কাজ (v4.0): মূল অভিজ্ঞতা chat-first। Owner স্বাভাবিক বাংলায় কথা, ছবি ও কাজ দেয়; conversation timeline-এ নির্দেশ, অগ্রগতি ও ফল থাকে। আরমান প্রতিটি উত্তরে মালিককে “বস” বলে ডাকবে। “আজকের কাজ” সংরক্ষিত ফল ও অপেক্ষমাণ কাজ দেখায়। প্রতিটি কমান্ডে খরচ বাঁচানোর স্থায়ী নিয়ম প্রযোজ্য। আগের site-specific signed bridge, revision-bound update ও financial safeguards বহাল।


এক মালিকের মোবাইল-উপযোগী ব্যক্তিগত এজেন্ট। বাংলায় নির্দেশ, পরিবর্তনযোগ্য ব্রেন/স্মৃতি/টুল, দৈনিক বা সাপ্তাহিক রুটিন, উৎসসহ রিপোর্ট ও সংশোধন এর মূল কাজ। ফোন বন্ধ থাকলেও চালু server deployment-এর worker কাজ করবে।

## কাজের পরিধি

- আরমানের একই নির্দেশের কিউতে মালিকের WhatsApp Business ও ব্যক্তিগত Telegram bot থেকে লিখিত নির্দেশ আসবে। অনুমোদিত মালিকের ঠিকানায় কাজের উত্তর যাবে।
- রুটিন পর্দায় ঐচ্ছিক মাসের ক্যালেন্ডার থেকে কিউতে থাকা পোস্ট ও প্রতিটি সক্রিয় রুটিনের পরের সময় দেখা যাবে।

- MT Studio ও Golapi Shop-এর Facebook/Instagram লেখা, অপরিবর্তিত ছবি আপলোড এবং এজেন্টের queue-তে সিডিউল; Meta-তে native schedule তৈরির দাবি নয়। সর্বোচ্চ প্রায় পাঁচ মিনিটের scheduler ব্যবধান, queue ও provider latency যোগ হবে।
- Gmail, WhatsApp Business থেকে সংগৃহীত events, নিজের API-অনুমোদিত Facebook পোস্ট ও দুই ওয়েবসাইটের configured records থেকে রিপোর্ট। কোনো উৎস অনুপলব্ধ হলে তা রিপোর্টে থাকবে।
- mt-studio-ai.com এবং golapishop.online-এর source-specific capability অনুযায়ী records পড়া ও typed action। Source repository-তে ফাইল পড়া, একটি বিদ্যমান ফাইলের পরিবর্তনের PR, configured CI পাস করলে ঐচ্ছিক merge এবং Netlify deployment যাচাই।
- User নিজে ব্রেনের model, instructions, memory, timezone, tool allowlist, খরচের daily limits ও autonomy flags বদলাবেন। রুটিনের সময়/দিন/কমান্ড/চালু-বন্ধ বদলানো যাবে।
- আগের manual draft editor ও confirmation-সহ Facebook প্রকাশ থাকবে। Personal profile-এর লেখা কপি করে নিজে প্রকাশ করতে হবে।

## সীমা ও গ্রহণযোগ্যতা

“সব” ওয়েবসাইট কাজ ব্যবহারকারীর লক্ষ্য; bridge-এর explicit mappings ও GitHub/Netlify integration ছাড়া বাস্তব সম্পূর্ণ প্রশাসনিক প্রবেশাধিকার পাওয়া যায় না। বর্তমান কোডে এক PR-তে একটি বিদ্যমান ফাইল পরিবর্তন হয়; নতুন ফাইল, বহুফাইল refactor, refund/payment gateway action, arbitrary terminal execution, video/reels, ব্যক্তিগত email/chat পাঠানো নেই। Actual payment collection/refund শুধু database status বদলানোর সমান নয়।

Gmail audit সর্বশেষ এক দিনের সর্বোচ্চ ৫০ message-এর headers/snippets; পুরো body/attachment নয়। WhatsApp audit সংযুক্ত platform/coexistence webhook events; Business অ্যাপ install থাকলেই ফোনের chat পড়া যায় না। ব্যক্তিগত Facebook audit অনুমোদিত নিজের পোস্টের সর্বোচ্চ ২৫টি; inbox/Messenger নয়। Website overview নির্বাচিত resource-এর প্রথম ২ record; paginated reads ১–১০ record প্রতি page; পূর্ণ code/security audit নয়। Coverage ও truncation দৃশ্যমান থাকবে।

সব বাইরের পরিবর্তন default-এ বন্ধ। Social/website/deploy আলাদা flags এবং routine allowWrites যাচাই হয়। Unknown write পুনরায় পাঠানো হবে না। কাজের অবস্থা, tool trace, রিপোর্ট evidence ও আগের report versions থাকবে।

## নথির বাস্তব প্রয়োগ

নিচের block build-এ পড়ে shared runtime contract হয়। Agent tool names, step/budget caps, polling interval, worker batch size এবং draft account/length validation কোডে ব্যবহৃত। বাংলা prose নিজে থেকে executable নয়; implementation ও tests প্রয়োজন।

## Build contract

```json blueprint
{
  "name": "MT Personal Agent",
  "maxPostLength": 1024,
  "maxTopicLength": 1500,
  "accounts": [
    {
      "key": "mt-studio",
      "label": "MT Studio",
      "kind": "page",
      "initial": "MT",
      "url": "https://www.facebook.com/mtstudioai",
      "prefix": "MT_STUDIO"
    },
    {
      "key": "golapi-shop",
      "label": "Golapi Shop Online",
      "kind": "page",
      "initial": "GS",
      "url": "https://www.facebook.com/profile.php?id=61596314931955",
      "prefix": "GOLAPI_SHOP"
    },
    {
      "key": "md-mahsin",
      "label": "Md Mahsin",
      "kind": "personal",
      "initial": "MM",
      "url": "https://www.facebook.com/Mahsin426"
    }
  ],
  "agent": {
    "tools": [
      "audit_sources",
      "prepare_post",
      "website_action",
      "read_code",
      "propose_code_change",
      "list_reports",
      "revise_report",
      "remember",
      "manage_routine",
      "merge_code_change",
      "deployment_status",
      "list_code"
    ],
    "name": "আরমান",
    "creditRule": "শুধু দেওয়া কাজটুকু করো। বাড়তি ধাপ, AI কল, ছবি তৈরি বা সম্পাদনা এবং অতিরিক্ত পোস্ট বাদ দাও। সংযুক্ত ছবি যেমন আছে তেমনই ব্যবহার করো।",
    "maxSteps": 8,
    "maxDailyAiCalls": 1000,
    "pollMs": 7000,
    "workerBatchSize": 5,
    "routineScanLimit": 100
  }
}
```
