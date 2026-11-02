# মোবাইলে MT Personal Agent ব্যবহার

এই সংস্করণে টার্মিনালের কমান্ড দেওয়ার প্রয়োজন নেই। ওয়েব অ্যাপ চালু হলে মোবাইলের ব্রাউজার থেকে বিষয় লিখবেন, পোস্ট তৈরি করবেন, খসড়া রাখবেন এবং অনুমোদন দিয়ে নিজের পেজে প্রকাশ করবেন।

## এখন কী প্রস্তুত

সম্পূর্ণ ওয়েব অ্যাপের কোড ও Netlify deployment configuration রয়েছে। নিজের Firebase, OpenAI ও Facebook সংযোগ বসানো হয়নি। এগুলো ছাড়া ডেমো দেখা ও এই ব্রাউজারে খসড়া রাখা যাবে; আসল AI, cloud খসড়া ও Facebook প্রকাশ চলবে না। ডেমোতে কোনো নমুনা ফলকে বাস্তব ফল বলা হয় না।

## ১. মোবাইল থেকে GitHub-এ কোড রাখুন

1. ZIP ডাউনলোড করে Files অ্যাপ দিয়ে unzip করুন।
2. GitHub-এ নিজের একটি private repository তৈরি করুন।
3. ZIP-এর ভেতরের `mt-personal-agent-mobile` ফোল্ডারের **ভেতরের ফাইলগুলো** repository root-এ দিন। Root-এ package.json ও netlify.toml থাকতে হবে। ZIP ফাইলটি একা upload করলে চলবে না।
4. মোবাইলে folder upload কঠিন হলে GitHub Codespaces-এর browser editor ব্যবহার করুন: repository → Code → Codespaces → Create codespace; editor-এর file upload দিয়ে folder structure বজায় রাখুন।
5. .env.example template থাকবে, কিন্তু নিজের key দিয়ে পূরণ করা .env বা service account JSON কখনো repository-তে দেবেন না।

## ২. Firebase প্রস্তুত করুন

[Firebase Console](https://console.firebase.google.com/)-এ নিজের project তৈরি করুন বা উপযুক্ত আগের project ব্যবহার করুন।

1. Authentication → Sign-in method → Email/Password চালু করুন।
2. Authentication → Users → Add user থেকে নিজের ইমেইল ও পাসওয়ার্ড দিন। অ্যাপে signup নেই।
3. তৈরি হওয়া user-এর UID কপি করুন। Netlify-তে OWNER_UID হবে এটি।
4. Firestore Database তৈরি করুন; production mode বেছে নিন। কোনো document হাতে তৈরি করতে হবে না।
5. Firestore → Rules-এ এই প্যাকেজের firestore.rules বসিয়ে Publish করুন। এটি সব client-side read/write বন্ধ রাখে; যাচাইকৃত server API কাজ করবে।
6. Project settings → General → Your apps → Web app register করুন। Web config থেকে apiKey, authDomain, projectId এবং appId নিন। এগুলো browser-এর Firebase সংযোগ পরিচয়; OpenAI key বা service-account private key নয়।
7. Project settings → Service accounts → Generate new private key থেকে JSON নিন। এই JSON সম্পূর্ণটি শুধু Netlify secret `FIREBASE_SERVICE_ACCOUNT_JSON` হিসেবে রাখবেন।
8. প্রয়োজন হলে billing/quota সক্রিয় করুন; নিজের provider dashboard-এ ব্যবহার ও খরচ দেখবেন।

## ৩. Netlify-তে সংযোগ

[Netlify](https://app.netlify.com/)-এ নিজের account দিয়ে GitHub repository import করুন।

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Node: 22

এই মানগুলো netlify.toml-এ আছে। GitHub import ব্যবহার করুন, যাতে dependency install ও Functions build হয়। শুধু public folder drag-and-drop করলে backend তৈরি হবে না।

Netlify-এর Environment variables-এ নিচের মানগুলো বসান। Runtime/Functions scope অন্তর্ভুক্ত করুন; সুবিধা হলে All scopes বাছুন। Sensitive মান secret হিসেবে রাখুন।

| নাম | মান |
| --- | --- |
| FIREBASE_WEB_API_KEY | Firebase web config-এর apiKey |
| FIREBASE_AUTH_DOMAIN | web config-এর authDomain |
| FIREBASE_PROJECT_ID | web config-এর projectId |
| FIREBASE_APP_ID | web config-এর appId |
| FIREBASE_SERVICE_ACCOUNT_JSON | service account-এর সম্পূর্ণ JSON, secret |
| OWNER_UID | Firebase-এ নিজের user UID |
| OPENAI_API_KEY | নিজের OpenAI API key, secret |
| OPENAI_MODEL | gpt-4o-mini অথবা নিজের account-এ সমর্থিত model |
| MT_STUDIO_PAGE_TOKEN | MT Studio-এর Page access token, secret |
| GOLAPI_SHOP_PAGE_TOKEN | Golapi Shop-এর Page access token, secret |
| MT_STUDIO_PAGE_ID | 2109209739156063 — মূল প্যাকেজ থেকে নেওয়া; নিজের Meta পেজে মিলিয়ে নিন |
| GOLAPI_SHOP_PAGE_ID | 1374136539122250 — মূল প্যাকেজ থেকে নেওয়া; নিজের Meta পেজে মিলিয়ে নিন |
| META_GRAPH_VERSION | নিজের Meta App-এ সমর্থিত version, যেমন v23.0; dashboard দেখে বসান |
| DRY_RUN | প্রথমে true |

সব মান বসানোর পরে redeploy করুন। Environment variables বদলালেও নতুন deploy প্রয়োজন। Key অ্যাপের কোনো input-এ বসাতে হবে না।

Netlify URL পাওয়ার পরে Firebase Authentication → Settings → Authorized domains-এ সেই hostname দিন, যেমন your-agent.netlify.app। Custom domain থাকলে সেটিও দিন।

## ৪. OpenAI ও Facebook

OpenAI API key নিজের API account থেকে নিন। API billing আলাদা; ChatGPT subscription দিয়ে এই backend-এর API ব্যবহার স্বয়ংক্রিয়ভাবে চালু হয় না। অ্যাপে প্রতিদিন সর্বোচ্চ ১০০টি AI request এবং দুই request-এর মাঝে অন্তত ১০ সেকেন্ড রাখা হয়েছে।

Meta App-এ নিজের পেজ পরিচালনার উপযুক্ত access লাগবে। Page publishing-এর জন্য `pages_manage_posts`, পেজের তথ্য পড়ার জন্য `pages_read_engagement` এবং পেজ/token নির্বাচন করতে `pages_show_list` প্রয়োজন হতে পারে। App mode, role, review ও access level অনুযায়ী অনুমতি ভিন্ন হতে পারে। Meta dashboard থেকে প্রযোজ্য অনুমতি ও সমর্থিত Graph version যাচাই করে প্রতিটি পেজের নিজস্ব **Page access token** নিন। Personal user token এখানে Page token-এর বদলে বসাবেন না।

সংযোগের পর “সংযোগ ও সেটআপ” অংশে মান দেওয়া হয়েছে কি না দেখা যাবে। Token কার্যকর বা মেয়াদ আছে কি না তা বাস্তব request-এর ফলে বোঝা যাবে। Page data অনুপলব্ধ হলে app তা দেখাবে; অনুমান করে সংখ্যা দেখাবে না।

## ৫. প্রথম ব্যবহার

1. Netlify URL Safari/Chrome-এ খুলুন।
2. Firebase-এ তৈরি নিজের ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন। অন্য UID দিয়ে server কাজ করতে দেবে না।
3. MT Studio / Golapi Shop / Md Mahsin বাছুন।
4. নিজের লেখা দিন, অথবা বিষয় লিখে “AI দিয়ে লিখুন” চাপুন।
5. বানান, তথ্য, মূল্য ও বক্তব্য দেখে প্রয়োজনমতো সম্পাদনা করুন।
6. “খসড়া সংরক্ষণ” চাপুন; cloud-এ রাখা হবে।
7. “আমার খসড়া” থেকে সম্পাদনা বা কপি করতে পারবেন।
8. বাস্তব প্রকাশ চালু করতে Netlify-তে DRY_RUN=false করে redeploy করুন।
9. খসড়ার “প্রকাশ” চাপলে পুরো লেখা ও পেজের নাম আবার দেখাবে। “হ্যাঁ, প্রকাশ করুন” চাপলেই শুধু Facebook-এ পাঠাবে।
10. Md Mahsin-এর ব্যক্তিগত পোস্ট কপি করে Facebook-এ নিজে দিন।

AI-generated লেখা তৈরি হওয়ার পর স্বয়ংক্রিয়ভাবে খসড়া সংরক্ষিত হয় না। “খসড়া সংরক্ষণ” চাপতে হবে। তালিকায় সর্বশেষ ২০০টি খসড়া/পোস্ট দেখা যায়।

## ৬. হোমস্ক্রিনে যোগ করুন

- iPhone: Safari → Share → Add to Home Screen।
- Android: Chrome → menu → Install app অথবা Add to Home screen।

এটি PWA, আলাদা APK নয়। Login session একই browser session-এর মধ্যে থাকে; আবার password চাইলে login করুন। Server-এর কাজের জন্য internet প্রয়োজন। Offline হলে আগে cache হওয়া পর্দা দেখা যেতে পারে, কিন্তু cloud খসড়া/AI/প্রকাশ চলবে না। Unsaved লেখা cloud-এ যায় না।

## ৭. প্রকাশের ফল অনিশ্চিত হলে

প্রকাশে timeout বা error হলে app একই post আবার পাঠাবে না। “পেজে গিয়ে ফল দেখুন” বা “প্রক্রিয়াধীন” দেখালে Facebook পেজ খুলে যাচাই করুন। একই পোস্ট থাকলে নতুন করে পাঠাবেন না। Administrator Firebase console-এ সংশ্লিষ্ট draft-এর ফল মিলিয়ে reconcile করতে পারেন। কোনো automatic retry দেওয়া হয়নি।

Firestore path: owners / OWNER_UID / drafts / draft-id। নিশ্চিতভাবে প্রকাশিত হলে status `published` ও postId লিখতে পারেন। পোস্ট একেবারেই যায়নি নিশ্চিত হলে তবেই status `draft` করা যায়। সন্দেহ থাকলে বদলাবেন না।

## ৮. যাচাইয়ের অবস্থা

- JavaScript syntax ও JSON build check সম্পন্ন।
- ৯টি automated backend test: authentication/ownership, draft save-edit-list-delete, validation, dry-run, approval, personal publish block, concurrent duplicate prevention, uncertain outcome এবং AI rate limit।
- Test-এ Firebase/OpenAI/Facebook-এর mock ব্যবহার করা হয়েছে; বাস্তব credentials দিয়ে integration test হয়নি।
- এই কাজের পরিবেশে browser থেকে স্থানীয় server পৌঁছানো যায়নি; সরাসরি mobile browser visual QA ও real PWA install পরীক্ষা হয়নি।
- Netlify/Firebase account সংযোগ ও hosting deployment ব্যবহারকারীকে সম্পন্ন করতে হবে; এই ZIP কোনো live hosting URL নয়।

## প্রয়োজনীয় নথি

- [Firebase ID token যাচাই](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Admin setup](https://firebase.google.com/docs/admin/setup)
- [Netlify Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/)
