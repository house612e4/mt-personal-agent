# Production deployment checklist

এই তালিকায় কোনো secret লিখবেন না। Secret শুধু Netlify environment variables-এ থাকবে।

## ১. Repository ও build

- ZIP-এর ভেতরের ফাইলগুলো repository root-এ রাখুন; `package.json` ও `netlify.toml` root-এ থাকতে হবে।
- `npm ci` এবং `npm run build` চালান। সব test pass না করলে deploy করবেন না।
- Netlify build command: `npm run build`; publish directory: `public`; functions directory: `netlify/functions`; Node: `22`।

## ২. Firebase

- Authentication-এ owner user এবং Email/Password sign-in চালু রাখুন। `OWNER_UID` ওই user-এর UID হতে হবে।
- Firestore rules ও indexes deploy করুন: `firebase deploy --only firestore`।
- Storage bucket চালু ও service account-এর object create/read/update/delete permission নিশ্চিত করুন।
- `firebase-storage-cors.json`-এ production agent domain ঠিক রেখে চালান:

  `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=firebase-storage-cors.json`

- Firebase Authentication authorized domains-এ Netlify ও custom production domain রাখুন।

## ৩. Netlify environment

- `.env.example`-এর ব্যবহৃত প্রতিটি variable Functions scope-এ আছে যাচাই করুন।
- `DRY_RUN=true` রেখে প্রথম deploy ও read-only verification করুন।
- `OPENAI_AGENT_MODEL`-এ আপনার API account-এ থাকা model দিন।
- `AGENT_BASE_URL` production HTTPS origin হবে। Netlify-এর `URL` থাকলে worker সেটিই আগে ব্যবহার করে।
- `MEDIA_RETENTION_DAYS` সাধারণত ৩০ রাখুন।
- Environment বদলানোর পরে production redeploy করুন।

## ৪. Functions ও scheduler

- Production deploy-এ `agent`, `chat`, `api`, `gmail-oauth`, `pulse`, `worker-background`, `telegram-webhook`, `whatsapp-webhook` function আছে যাচাই করুন।
- `pulse` schedule প্রতি পাঁচ মিনিটে সক্রিয় আছে যাচাই করুন। Deploy preview নয়, published production deploy ব্যবহার করুন।
- Netlify logs-এ `worker-background` 401 হলে `INTERNAL_WORKER_SECRET`; 503 হলে owner/Firebase/base URL পরীক্ষা করুন।

## ৫. Website bridge

- MT Studio ও Golapi Shop—দুই repository-তেই `adapters/site-bridge` installer-এর generated overlay deploy করতে হবে। Agent repository deploy করলেই target website control চালু হয় না।
- দুই site-এ আলাদা bridge key রাখুন। `*_BRIDGE_URL` অবশ্যই সংশ্লিষ্ট production domain-এর HTTPS URL হবে।
- প্রথমে read actions যাচাই করুন; তারপর target site-এ `AGENT_BRIDGE_ALLOW_WRITES=true` দিন। Financial action প্রয়োজন না হলে financial writes বন্ধ রাখুন।

## ৬. প্রথম live verification

- Owner account দিয়ে লগইন → **সেটআপ → সব সংযোগ যাচাই করুন**। OpenAI, Gmail, configured Meta/Telegram এবং website bridge-এর read-only live ফল দেখুন।
- Brain-এ প্রয়োজনীয় permission একবারে একটি করে চালু করুন।
- একটি test chat পাঠিয়ে streaming শেষ হওয়া, chat history এবং push যাচাই করুন।
- ১০ MB-এর নিচে একটি test image এবং ১০০ MB-এর নিচে একটি ছোট MP4 upload করুন। Posting permission বন্ধ রেখে upload path আগে পরীক্ষা করা যায়।
- `DRY_RUN=false` করার পর test page-এ একটি private/low-risk text post, তারপর photo, তারপর video দিন। প্রতিটি provider ID সংরক্ষিত হয়েছে যাচাই করুন।
- একটি পাঁচ মিনিট পরের routine দিন; browser বন্ধ রেখে কাজ ও push পৌঁছানো যাচাই করুন।

## ৭. Release acceptance

- Settings-এর live verification-এ সব প্রয়োজনীয় check সবুজ।
- Facebook/Instagram provider ID, Gmail message ID, WhatsApp/Telegram message ID এবং website audit record বাস্তবে পাওয়া গেছে।
- একই command দুইবার পাঠালে duplicate post/message হয়নি।
- failed push পরের pulse-এ retry হয়েছে।
- Storage-এ ৩০ দিনের বেশি পুরোনো `agent-media/` object cleanup হয়েছে।
- Android/iPhone-এ keyboard, drawer, attachment, PWA install এবং notification পরীক্ষা হয়েছে।

## ৮. Rollback

- Netlify-এর আগের successful production deploy প্রস্তুত রাখুন।
- সমস্যা হলে Brain-এর social/communication/website/deploy permissions বন্ধ করুন এবং `DRY_RUN=true` করুন।
- Unknown external outcome-এ একই command পুনরায় পাঠাবেন না; provider/page/site audit দেখে ফল নিশ্চিত করুন।
