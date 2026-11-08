# মোবাইলে MT Personal Agent v6.0 চালু করা

কোডে এজেন্টের command queue, routine, brain, report ও provider adapters আছে। নিজের server/account/site সংযোগ এখনো বসানো হয়নি। নিচের setup একবার করতে হবে; এরপর মোবাইলের ব্রাউজার থেকেই কমান্ড ও দৈনিক রুটিন বদলাতে পারবেন। Secret এখানে বা chat-এ পাঠাবেন না।

## ১. Agent deploy

ZIP unzip করুন। GitHub private repository-র root-এ mt-personal-agent ফোল্ডারের **ভিতরের** ফাইল রাখুন; package.json ও netlify.toml root-এ থাকবে। মোবাইলে প্রয়োজন হলে GitHub Codespaces browser editor ব্যবহার করুন। ZIP ফাইলটি শুধু repository-তে upload করলে app deploy হবে না।

Firebase-এ Firestore, Email/Password Authentication এবং নিজের একটি user তৈরি করুন। User UID হবে OWNER_UID। firestore.rules publish এবং firestore.indexes.json-এর দুই composite index তৈরি/deploy করুন। Firebase CLI থাকলে project নির্বাচন করে `firebase deploy --only firestore` চালানো যায়; নইলে console থেকে সমতুল্য indexes দিন। Production client access deny থাকবে।

Netlify-তে GitHub repo import: build `npm run build`, publish `public`, functions `netlify/functions`, Node 22। শুধু public folder drag-and-drop নয়। Firebase Auth authorized domains-এ Netlify/custom hostname যোগ করুন।

Netlify environment variables-এ Functions scope-সহ .env.example-এর প্রয়োজনীয় মান দিন এবং redeploy করুন:

| মূল নাম | কোথা থেকে / কী |
| --- | --- |
| FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID | Firebase project-এর web app config |
| FIREBASE_SERVICE_ACCOUNT_JSON | Project settings → service accounts; সম্পূর্ণ JSON secret |
| OWNER_UID | নিজের Firebase Auth user UID |
| OPENAI_API_KEY | নিজের billed API account key |
| INTERNAL_WORKER_SECRET | নিজের অন্তত ৩২ অক্ষরের random secret |
| CREDENTIAL_ENCRYPTION_KEY | ৩২ random bytes-এর base64; Gmail token encryption |
| AGENT_BASE_URL | deployed agent-এর HTTPS origin; Netlify URL env থাকলে সেটি ব্যবহৃত হয় |
| FIREBASE_STORAGE_BUCKET | নিজের Firebase Storage bucket নাম; মূল ছবি আপলোডের জন্য |
| DRY_RUN | প্রথমে true; বাস্তব social প্রকাশে false |

Codespaces terminal-এ worker secret-এর জন্য `openssl rand -hex 32`, encryption key-এর জন্য `openssl rand -base64 32` চালাতে পারেন। ভিন্ন values দিন, server settings-এ সংরক্ষণ করুন। Encryption key হারালে/বদলালে Gmail আবার connect করতে হবে। নিজের .env বা service-account JSON GitHub-এ commit নয়। Storage provider-এর billing/quota চালু করুন; images-এর token URL যার কাছে থাকবে সে ছবিটি দেখতে পারবে। ব্যক্তিগত ছবি এভাবে প্রকাশ করবেন কি না নিজে সিদ্ধান্ত নিন।

Netlify production deployment-এ pulse schedule চালু হয়েছে এবং worker-background function তৈরি হয়েছে যাচাই করুন। Pulse প্রতি পাঁচ মিনিটে due jobs চালানোর চেষ্টা করে; exact-minute delivery নয়। ফোন বন্ধ থাকলেও deployed server কাজ করবে। Server deployment/plan/scheduler না চললে শুধু PWA install দিয়ে routine চলবে না।

## ২. Gmail সংযোগ

Google Cloud project-এ Gmail API enable করুন। OAuth consent এবং Web application OAuth client তৈরি করুন। GOOGLE_CLIENT_ID ও GOOGLE_CLIENT_SECRET Netlify secrets-এ দিন। Authorized redirect URI হবে:

`https://YOUR-AGENT-DOMAIN/.netlify/functions/gmail-oauth`

সেটি deployed hostname-এর সঙ্গে একদম মিলতে হবে। Consent app testing mode হলে নিজের Gmail test user হিসেবে দিন; testing-token expiry/production verification ও refresh-token restrictions নিজের Google project-এ যাচাই করুন। Redeploy-এর পরে owner login → ব্রেন → Gmail যুক্ত করুন → নিজের Gmail-এ readonly consent। Token encrypted অবস্থায় server database-এ থাকবে। GMAIL_REFRESH_TOKEN optional fallback; সাধারণ ব্যবহারে ফাঁকা রাখুন।

এখন Gmail audit সর্বশেষ এক দিনের সর্বোচ্চ ৫০ message-এর subject/from/date/snippet ও labels পড়ে। Agent tool দিয়ে search, একটি message-এর plain-text body পড়া, email পাঠানো, read করা ও archive করা যায়। Attachment পড়ে না। আগে readonly consent দিয়ে থাকলে নতুন `gmail.modify` permission-এর জন্য অ্যাপ থেকে আবার Gmail যুক্ত করুন। ব্যক্তিগত ব্যবহারে Google OAuth test user হিসেবে নিজের account রাখুন; public app হলে Google-এর verification নিয়ম প্রযোজ্য হতে পারে।

## ৩. WhatsApp Business অ্যাপ

শুধু ফোনে WhatsApp Business থাকা এই server-কে chat access দেয় না। নিজের number-এর জন্য Meta/সমর্থিত provider-এর Business Platform বা Business-app coexistence onboarding সম্পন্ন করতে হবে। Onboarding availability ও number/account eligibility provider-এর কাছে যাচাই করুন।

Agent env-এ WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN এবং META_APP_SECRET দিন। Meta webhook callback:

`https://YOUR-AGENT-DOMAIN/.netlify/functions/whatsapp-webhook`

একই verify token এবং প্রয়োজনীয় message/coexistence subscriptions বসান। Secret signature ও exact phone ID না মিললে data গ্রহণ হয় না। নতুন incoming events এবং provider দিলে echo/history events সংগ্রহ হয়। History events backfill হিসেবে চিহ্নিত। ফোনের পুরোনো সব chats বা media contents নিজে থেকে আসে না; বাস্তব inbound/echo coverage পরীক্ষা করে নিন।

মালিকের WhatsApp থেকে আরমানকে লিখে নির্দেশ দিতে Functions scope-এ `WHATSAPP_OWNER_NUMBER` (দেশের কোডসহ নিজের প্রেরক নম্বর), `WHATSAPP_TOKEN` ও `META_GRAPH_VERSION` দিন। ওই নম্বর থেকে সংযুক্ত WhatsApp Business নম্বরে টেক্সট পাঠান। ফল একই চ্যাটে যাবে। অন্য নম্বরের বার্তা শুধু অনুমোদিত audit-এর তথ্য হিসেবে থাকবে। উত্তর পাঠানোর ফল নিশ্চিত না হলে আরমানের ওয়েব চ্যাটে কাজের ফল দেখা যাবে।

### Telegram-এ আরমান

1. BotFather দিয়ে নিজের bot তৈরি করুন। Functions scope-এ `TELEGRAM_BOT_TOKEN` ও নিজের ব্যক্তিগত সংখ্যাসূচক `TELEGRAM_OWNER_CHAT_ID` দিন।
2. `openssl rand -hex 32` দিয়ে নতুন `TELEGRAM_WEBHOOK_SECRET` তৈরি করুন। Functions scope-এ সেভ করে redeploy করুন।
3. [Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook)-এ নিজের bot-এর জন্য `url` হিসেবে `https://YOUR-AGENT-DOMAIN/.netlify/functions/telegram-webhook`, `secret_token` হিসেবে একই secret, এবং `allowed_updates` হিসেবে `["message"]` দিন।
4. Telegram-এ bot-এর ব্যক্তিগত চ্যাট খুলে একটি সাধারণ টেক্সট লিখুন। যেমন “বসের জন্য একটি শুভেচ্ছা লিখো।” ফল একই ব্যক্তিগত চ্যাটে যাবে। একই বার্তার পুনঃডেলিভারিতে দ্বিতীয় কাজ তৈরি হয় না।

## ৪. ব্যবসার Facebook ও Instagram

Meta app-এর supported META_GRAPH_VERSION দিন। MT_STUDIO_PAGE_ID/TOKEN ও GOLAPI_SHOP_PAGE_ID/TOKEN নিজের Page data দিয়ে মিলিয়ে দিন; template-এর পুরোনো IDs অন্ধভাবে বিশ্বাস নয়। Publishing/reading-এর প্রযোজ্য permissions ও app access নিজে configure করুন।

Professional Instagram account ও Page connection অনুযায়ী MT_STUDIO_INSTAGRAM_ID এবং GOLAPI_SHOP_INSTAGRAM_ID দিন। এখানে Page-token-ভিত্তিক Facebook Login Graph integration আছে। চ্যাটে PNG/JPEG ছবি বাছাই করে নির্দেশসহ পাঠান। পোস্টে একই মূল ফাইল ব্যবহার হয়। ছবি AI-তে পাঠানো, বদলানো বা তৈরি করার ধাপ নেই। Video/reels নেই।

নিজের Facebook posts audit-এর জন্য PERSONAL_FACEBOOK_USER_TOKEN ও অনুমোদিত own-post reading access প্রয়োজন। এটি Messenger/personal inbox audit নয়।

সংযোগ থাকলে DRY_RUN=false করে controlled test দিন। Brain-এ automatic social permission-ও লাগবে। Default-এ autonomy flags বন্ধ। আগের manual editor-এ প্রতিটি publish-এর confirmation থাকবে; agent command/routine অনুমোদিত হলে তার আলাদা queue worker প্রকাশ করবে। Schedule agent database-এ থাকে, Meta-native schedule নয়।

## ৫. দুই ওয়েবসাইটের প্রস্তুত সংযোগ

এই ZIP-এ দুই সাইটের bridge কোড ও installer আছে। সংশ্লিষ্ট সাইটের বর্তমান source repository-তে সংযোগ স্থাপন করতে হবে।

Installer চালান: `node scripts/install-site-bridge.mjs --site mt-studio --target /path/to/mt-studio-repo` অথবা `--site golapi-shop --target /path/to/golapi-repo`। এটি bridge files, target configuration ও test যোগ করে; অন্য app source বদলায় না। Package identity/required files যাচাই করে ও মূল logic source hash মেলায়; আগে ইনস্টলার বদলানো package/netlify configuration hash এই guard-এ ধরা হয় না। পর্যালোচিত logic আলাদা হলে পরিবর্তন করার আগে থামে। Agent zip-এর কোড Codespaces-এ রাখা হলে script চালানো যাবে।

প্রত্যেক **target site-এর Netlify** environment-এ দিন:

| নাম | মান |
| --- | --- |
| FIREBASE_SERVICE_ACCOUNT_JSON | সেই site-এর নিজের Firebase project-এর service account; agent-এর database account ধরে নেবেন না |
| AGENT_BRIDGE_KEY | আলাদা random secret, অন্তত ৩২ অক্ষর; agent-এর সংশ্লিষ্ট *_BRIDGE_KEY-তে একই মান |
| AGENT_BRIDGE_ALLOW_WRITES | শুরুতে false; controlled read test-এর পরে প্রয়োজনমতো true |
| AGENT_BRIDGE_FINANCIAL_WRITES | শুরুতে false; wallet/credit/payment review/cancellation অনুমতি দিতে true |

MT Studio-এর বর্তমান firebase-admin 13.6.0 রাখা হয়েছে। Golapi Netlify root-এ firebase-admin 14.5.0, patched glob override ও lock দেওয়া হয়েছে; তার আলাদা Firebase Cloud Functions package পরিবর্তন করা হয়নি। Existing site frontend login, admin session/MFA এবং Firestore client rules অপরিবর্তিত। Bridge-এর machine key পৃথক delegated access; শুধু server env-এ থাকবে।

Agent env:

| নাম | মান |
| --- | --- |
| MT_STUDIO_BRIDGE_URL | https://mt-studio-ai.com/.netlify/functions/agent-bridge |
| GOLAPI_SHOP_BRIDGE_URL | https://golapishop.online/.netlify/functions/agent-bridge |
| MT_STUDIO_BRIDGE_KEY, GOLAPI_SHOP_BRIDGE_KEY | সংশ্লিষ্ট site-এর key; দুই site-তে ভিন্ন key |

সব deploy-এর পরে Setup → “সব সংযোগ যাচাই করুন” চাপুন। এটি OpenAI ও configured Gmail/Meta/Telegram/website bridge-এ নিরাপদ live read request চালায়। শুধু settings presence দেখে successful connection বলে না।

### কোন কাজের সংযোগ আছে

| সাইট | পড়া / কাজ |
| --- | --- |
| MT Studio | brand/policies, users, manualPayments, records, files, photo contests, competitions/claims/audit পড়া; brand/policies বদলানো; photo contest save/close; অনুমতিসাপেক্ষে payment approve/reject/reopen ও verified customer credit adjustment |
| Golapi Shop | orders/products/users/staff/drivers/tickets/refunds/payouts/coupons/stock/procurement/campaigns/escalations/settings পড়া; existing product info/stock/price বদলানো; store settings; order note/valid status step/driver assignment; atomic cancellation; payment verification; ticket status/priority |

প্রথমে capabilities, তারপর paginated list/get; প্রত্যেক update-এ exact latest revision লাগে। Page limit ১–১০, default ৫; document-ID order, latest-first নয়। Overview প্রতি নির্বাচিত resource-এর প্রথম দুই record-এর নমুনা; পূর্ণ daily totals নয়। Secret/private subcollections প্রকাশ হয় না; text/nesting/arrays capped। প্রয়োজনীয় আরও page না পড়ে “সব audit হয়েছে” বলা যাবে না।

Golapi cancellation এক transaction-এ wallet/coupon/stock ও audit বদলায়; operation ID replay হলে আর টাকা/stock বদলায় না। Pickup শুরু হলে cancel blocked। Custom-bazar advance ও external bKash/Nagad/bank refund এই action ফেরত পাঠায় না; manual refund required দেখায়।

MT Studio approved manual receipt-এর একই hash ব্যবহার হয়; একই receipt দিয়ে দুবার credit পাওয়া যায় না। Financial approval-এ মালিকের বাস্তব bank/receipt যাচাইয়ের reference দিতে হবে; agent-এর bank account reading নেই। সন্দেহজনক/unverified receipt approve করতে বলবেন না। পেমেন্ট status পরিবর্তন টাকা পাঠানো বা bank verification-এর সমান নয়।

Golapi legacy driver-directory ID থেকে একক phone link দিয়ে active staff auth UID মেলানো হয়। একাধিক match হলে guess করে assign হয় না। ড্রাইভার accept না করলে pickup/delivery stage চালানো যায় না। Existing Firebase triggers deployed থাকলে order update-এর নিজস্ব notification/referral flow কাজ করতে পারে; bridge SMS/WhatsApp পাঠিয়েছে বলে দাবি করে না।

নতুন arbitrary table, user role/permission change, customer reply, external payout/refund, delete, নতুন product creation, multi-file code refactor এবং সব ERP workflow-এর write adapter নেই। এগুলোকে implemented বলা যাবে না। Source-এর static service catalog/code পরিবর্তনের জন্য repository PR tool ব্যবহার হবে।

### কোড ও deployment

GITHUB_AGENT_TOKEN selected repositories-তে Contents/Pull requests write ও Checks read access দিন। *_GITHUB_REPO `owner/name` আকারে নিজের actual repository বসান। শুধু uploaded ZIP থেকে owner নির্ধারণ করা যায় না।

এই source-ভিত্তিক CI check names:

- MT_STUDIO_REQUIRED_CHECKS=validate — MT Studio-এর বিদ্যমান CI job।
- GOLAPI_SHOP_REQUIRED_CHECKS=validate-agent-site — নতুন push/PR website check; আগে শুধু manual APK workflow ছিল।

Brain-এ website/deploy permission, GitHub branch protection ও existing Netlify Git deployment দরকার। NETLIFY_AGENT_TOKEN এবং *_NETLIFY_SITE_ID থাকলে merge commit-এর actual deployment state poll হয়। নতুন bridge+CI deploy এবং real account test এখনো বাকি; local tests remote success-এর প্রমাণ নয়।

## ৬. মোবাইল থেকে নিয়মিত ব্যবহার

Owner login → Brain-এ নিজের instructions, memory, text model, timezone ও daily AI সীমা ঠিক করুন। Default timezone নিজের সঙ্গে মিলিয়ে বদলান। Default দৈনিক সীমা ১০০ Responses call। পোস্ট কিউ, রুটিন সংরক্ষণ ও রিপোর্টের ফল থেকে সরাসরি উত্তর আসে। প্রয়োজনীয় বহু-ধাপের নির্দেশে একাধিক call লাগতে পারে। Provider billing আলাদা। Model নাম লিখলেই account access পাওয়া যায় না।

কমান্ডের উদাহরণ:

- “Gmail, WhatsApp আর নিজের Facebook পোস্টের রিপোর্ট করো। কোন উৎস পড়তে পারোনি জানাও।”
- “MT Studio-এর জন্য একটি Facebook পোস্ট লিখে আগামীকাল আমার timezone-এ রাত ৮টায় সিডিউল করো। অফার বানাবে না।”
- “Golapi Shop-এর capabilities দেখে products পড়ো, তারপর এই পণ্যের description বদলাও।”
- “এই report ID-এর লেখায় আমার নির্দেশ অনুযায়ী সংশোধন করো; মূল evidence রেখো।”

Routines-এ title/command/time/timezone/days দিন। “কাজের ক্যালেন্ডার” খুললে নির্বাচিত মাসের অপেক্ষমাণ পোস্ট ও সক্রিয় রুটিনের পরের সময় দেখা যাবে। দৈনিক audit-এর routine শুধু read দিয়েই চলতে পারে। বাইরের post/website changes চাইলে routine allowWrites এবং Brain-এর সংশ্লিষ্ট permission দুটোই চালু থাকতে হবে। রুটিন pause/edit করলে পুরোনো version-এর queued কাজ cancel হয়; running action ফিরিয়ে নেওয়া যায় না।

Reports-এ লেখার সঙ্গে evidence/coverage দেখুন, সম্পাদনা করুন। Agent jobs-এ ধাপ দেখুন। “ফল যাচাই প্রয়োজন” হলে বাইরের site/page-এ বাস্তব ফল দেখুন; একই কাজ তাড়াতাড়ি আবার পাঠাবেন না। Manual draft publication-এর uncertain outcome-এ অন্তত দুই মিনিট পরে owner reconciliation করুন।

Android Chrome menu বা iPhone Safari Share থেকে Add to Home Screen করুন। PWA, APK নয়। Internet ছাড়া নতুন command/report fetch হবে না। Logout ব্যক্তিগত পর্দা সরায়; unsaved লেখা cloud-এ যায় না।

## যাচাই ও অবশিষ্ট কাজ

`npm run build` চালালে বর্তমান প্যাকেজের স্বয়ংক্রিয় পরীক্ষার ফল দেখা যাবে। Local automated checks mocked services/DOM দিয়ে হয়েছে; live accounts, target repositories, deployed Node 22, phone-closed routine এবং actual Android/iPhone layout পরীক্ষা deploy-এর পরে বাকি। Settings-এ Facebook-এর “লাইভ যাচাই” button token ও Page ID দিয়ে সত্যিকারের Graph request করে। এই কোডকে credentials, provider permissions ও live validation ছাড়া সম্পূর্ণ চালু ব্যক্তিগত agent বলা যাবে না।

## অনুবাদ ও Netlify ব্যাজ

পেজে translate="no" এবং notranslate নির্দেশ দেওয়া আছে। Browser নিজস্ব অনুবাদের বার দেখালে × চেপে বন্ধ করুন। ব্রাউজারের “এই ভাষা অনুবাদ করবে না” পছন্দ থাকলে বাংলা বাছতে পারেন।

Powered by Netlify ব্যাজ hosting থেকে যুক্ত হয়। নিজের Netlify project → Project configuration → General → Powered by Netlify badge বন্ধ করে Save করুন। পরেরবার পেজ খুললেই নতুন সেটিং কার্যকর হবে। [Netlify-এর নিয়ম](https://docs.netlify.com/manage/projects/powered-by-netlify-badge/)


## এই সংস্করণের নতুন সেটআপ

### Server-side push

1. Terminal-এ `npx web-push@4.0.0 generate-vapid-keys --json` দিয়ে একবার key pair তৈরি করুন।
2. Netlify Functions scope-এ `VAPID_PUBLIC_KEY` ও `VAPID_PRIVATE_KEY` দিন। `VAPID_SUBJECT`-এ নিজের `mailto:you@example.com` অথবা HTTPS site URL দিন। Private key server-এ রাখুন।
3. Redeploy করুন। অ্যাপের মেনু → সেটআপ → নোটিফিকেশন চালু করো চাপুন ও অনুমতি দিন। সঙ্গে সঙ্গে পরীক্ষামূলক push পাঠানো হবে। সেটি এলে server-to-device পথটি কার্যকর।

### যোগাযোগ ও শক্তিশালী ব্রেন

Brain-এ “ইমেইল ও বার্তা পাঠাতে পারবে” চালু না থাকলে Gmail/WhatsApp/Telegram write হবে না। বর্তমান নির্দেশে প্রাপক ও কী পাঠাতে হবে স্পষ্ট থাকতে হবে। WhatsApp-এর সাধারণ text provider-এর conversation-window নিয়ম মানে; window-এর বাইরে আগে থেকে অনুমোদিত template ব্যবহার করুন। Telegram bot শুধু যে chat-এ প্রবেশাধিকার পেয়েছে সেখানে পাঠাতে পারে।

Default model `gpt-6-astra`, reasoning `medium`, সর্বোচ্চ ১০ ধাপ; চাইলে ১২ পর্যন্ত করা যায়। Provider account-এ model access না থাকলে Brain থেকে নিজের account-এ থাকা model দিন। আলাদা memory records থেকে বর্তমান command-এর সঙ্গে মেলা সর্বশেষ স্মৃতি context-এ আসে। বেশি reasoning ও ধাপের খরচ বেশি হতে পারে।
4. iPhone-এ iOS 16.4 বা নতুন সংস্করণে Safari/ব্রাউজারের Share → Add to Home Screen দিয়ে অ্যাপ খুলে অনুমতি দিন। Server worker কাজ শেষ হলে push service-এ encrypted notification পাঠাবে। অ্যাপ খোলা রাখা লাগে না। ডিভাইসের Focus/notification settings ও নেটওয়ার্ক delivery-তে প্রভাব ফেলতে পারে।

### ছবি, ভিডিও ও ক্যাপশন

প্লাস বোতামে সর্বোচ্চ ১০ MB-এর PNG/JPEG অথবা ১০০ MB-এর MP4/MOV বেছে নির্দেশ দিন। Browser signed URL-এ raw file পাঠায়; Base64 বা server-memory upload নয়। `firebase-storage-cors.json` production bucket-এ প্রয়োগ করতে হবে। মূল bytes অপরিবর্তিতভাবে Storage-এ সেভ হয় এবং default ৩০ দিন পরে cleanup হয়। Media পোস্টে ক্যাপশন খালি, অনুপস্থিত বা null হলে empty string হয়। Instagram/Facebook ভিডিও processing শেষ হওয়া পর্যন্ত worker provider state ধরে poll করে।

### চ্যাটের ব্যবহার

মেনুতে নতুন চ্যাট ও সাম্প্রতিক কথোপকথন পাওয়া যাবে। প্রতিটি চ্যাটের context আলাদা। সাম্প্রতিক ১০০টি job থেকে কথোপকথনের তালিকা এবং নির্বাচিত কথোপকথনের সর্বশেষ ৪০টি job দেখা যায়। চ্যাট খোলা, বদলানো বা নতুন চ্যাট শুরুতে AI কল লাগে না।

Golapi Facebook URL `https://www.facebook.com/profile.php?id=410455022157073`। নিজের token ওই Page ID-এর সঙ্গে মেলাবেন।
