# MT Personal Agent — Mobile v2

মোবাইলের ব্রাউজারে ব্যবহারযোগ্য বাংলা ওয়েব অ্যাপ। Netlify Functions + Firebase Authentication + Firestore।

**শুরু করুন: [GUIDE-BN.md](GUIDE-BN.md)**

- তিন অ্যাকাউন্টের জন্য লেখা ও খসড়া; দুই Facebook পেজে অনুমোদিত text post।
- AI লেখার প্রিভিউ, সম্পাদনা, কপি, সংরক্ষণ এবং প্রকাশের confirmation।
- এক মালিকের Firebase login, server-side UID যাচাই; public signup নেই।
- Firestore-এ বাস্তব খসড়া; ডেমোতে শুধু browser-local খসড়া।
- মোবাইল navigation, desktop layout, PWA manifest, home screen icons।
- Page followers/likes এবং latest five posts; reach বা revenue বানিয়ে দেখানো হয় না।
- ছবি/ভিডিও প্রকাশ, schedule, comments/replies এবং autonomous background agent এই সংস্করণের scope নয়।

## Local development

Node 22+, `npm ci`, `npm test`, `npm run build`; এরপর `.env.example` দেখে নিজের `.env` তৈরি করে `npm run dev`। শুধু HTML file খোলা বা static server-এ demo দেখা যায়; backend-এর জন্য Netlify dev/deployment লাগবে।

## Deployment

GitHub repository থেকে Netlify import করুন। Build `npm run build`, publish `public`, functions `netlify/functions` — netlify.toml-এ নির্ধারিত। Netlify UI-তে runtime environment variables বসিয়ে redeploy করুন। .env deploy বা commit করবেন না।

## Layout

`public/` frontend/PWA; `netlify/functions/api.mjs` authenticated API; `server/core.mjs` validation/external request helper; `firestore.rules` server-only data access; `tests/` mocked backend integration tests।

## Publication outcome

Firestore transaction দিয়ে draft lock করা হয়। Failed/timeout request-এর পরে `review_required` করা হয়; automatic retry নেই, কারণ remote publish হয়ে response হারাতে পারে। `publishing` অবস্থায় process বন্ধ হলেও retry blocked থাকে। Facebook-এ ফল দেখে manual reconciliation করতে হবে; Firebase console থেকে status বদলানোর আগে post নিশ্চিত করুন।
