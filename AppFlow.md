# MT Personal Agent — App flow v3.1

v3.1 website flow: live capabilities → resource.list/get → exact revision + typed action → transaction-এ operation/audit/result commit। Conflict হলে reread; একই operation ID-তে অন্য input নয়। Target write/financial flags-ও যাচাই হবে।


## প্রবেশ ও প্রধান পর্দা

Login → owner UID যাচাই → chat-first Agent। মূল স্ক্রিনে owner-এর message, সংযুক্ত ছবি, agent-এর অগ্রগতি ও চূড়ান্ত ফল একই conversation timeline-এ থাকে। নিচে Agent / Routines / Reports / Brain / Settings navigation। চ্যাট খোলা ও রিফ্রেশ শুধু সংরক্ষিত অবস্থা পড়ে। আজকের কাজ মালিকের timezone ধরে দেখায়। Demo শুধু আগের local draft editor; cloud agent-এর demo execution নেই। Logout ব্যক্তিগত rendered content সরায়।

Agent-এ নির্দেশ → stable request ID-সহ durable queued job → private worker wake → transaction claim → running → bounded tool loop → ফল। একই claim-এর transaction retry আরেক worker-এর job ফেরত দিতে পারবে না।

| অবস্থা | অর্থ / পরের কাজ |
| --- | --- |
| queued | সময়/worker-এর অপেক্ষা; cancel করা যায় |
| running | worker কাজ করছে; active job cancel নয় |
| succeeded | সংশ্লিষ্ট ধাপের ফল; PR তৈরি মানেই deploy নয় |
| attention | কিছু tool ব্যর্থ; trace দেখুন, পুরো কাজ অন্ধভাবে আবার নয় |
| blocked | সংযোগ/অনুমতি/CI বাকি; ঠিক করে explicit retry |
| failed | completion হয়নি; side effect অনিশ্চিত না হলে retry |
| uncertain | বাইরের ফল নিশ্চিত নয়; automatic বা সাধারণ retry বন্ধ |
| cancelled | queued job বাতিল বা routine pause/version পরিবর্তিত |

## বাহ্যিক চ্যাট ও ক্যালেন্ডার

যাচাইকৃত webhook → মালিকের নতুন টেক্সট বার্তা → provider message ID দিয়ে একই command job → worker → ফল একই অনুমোদিত চ্যাটে। পুনঃডেলিভারিতে নতুন job হয় না। ফল পাঠানো অনিশ্চিত হলে কাজটি নিজে থেকে আবার চলে না।

রুটিন → কাজের ক্যালেন্ডার → মাস বাছুন। শুধু ওই মাসের অপেক্ষমাণ পোস্ট ও রুটিনের পরের সময় পড়া হয়।

## রুটিন ও সিডিউল

Routines → শিরোনাম/নির্দেশ/HH:mm/IANA timezone/সপ্তাহের দিন → save। চাইলে allowWrites; ব্রেনের সংশ্লিষ্ট flag-ও চালু থাকতে হবে। Pulse প্রতি পাঁচ মিনিটে due routine enqueue করে এবং worker wake করে। একই routine/version/local-date occurrence পুনরায় enqueue হয় না। Pause/edit করলে পুরোনো version-এর pending কাজ cancel হয়; চলমান কাজ ফিরিয়ে নেওয়া যায় না। Downtime-এর সব missed occurrence replay হয় না; একটি due occurrence-এর পরে পরবর্তী সময় নির্ধারণ হয়। DST-তে অনুপস্থিত local time হলে পরের matching দিন।

পোস্ট সিডিউল মানে ভবিষ্যতের social job; provider-এ এখনই প্রকাশ নয়। এক কমান্ডে সর্বোচ্চ একটি পোস্ট কিউতে যায়। তার স্থায়ী child ID একই কমান্ড পুনরায় প্রসেস হলেও অপরিবর্তিত থাকে। কিউয়ের ফল থেকে সরাসরি চ্যাটের উত্তর আসে। Merge/deployment pending হলে পাঁচ মিনিট পরে read poll, সর্বোচ্চ ২৪ বার; ambiguous writes retry নয়।

## রিপোর্ট ও সংশোধন

Audit → বাস্তব source fetch → coverage/errors-সহ evidence → AI factual summary → report। Reports থেকে লেখা সম্পাদনা অথবা report ID দিয়ে সংশোধনের নির্দেশ। পুরোনো লেখা ও evidence history-তে থাকে; correction মূল উৎস বদলায় না। Stale version save বন্ধ। AI অসম্পূর্ণ উত্তর complete report হিসেবে গ্রহণ হয় না।

## আগের manual posting

Account → লেখা/AI → preview/edit → versioned save → publish confirmation → transaction lock → published অথবা review_required। Unknown publication-এ অন্তত দুই মিনিট পরে মালিক actual page দেখে reconciliation করবেন। Personal profile publishing blocked।

## Build contract

```json blueprint
{
  "states": {
    "draft": "draft",
    "publishing": "publishing",
    "published": "published",
    "review": "review_required"
  },
  "minRecoveryWaitMs": 120000,
  "providerTimeoutMs": 20000,
  "clientTimeoutMs": 60000,
  "configTimeoutMs": 15000
}
```
