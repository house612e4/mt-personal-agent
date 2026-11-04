# MT Personal Agent — project instructions

## Read before editing

এই project-এর canonical blueprints root-এ:

1. [PRD.md](PRD.md) — scope/acceptance।
2. [AppFlow.md](AppFlow.md) — interaction ও failure states।
3. [UI_Spec.md](UI_Spec.md) — design system।
4. [TRD.md](TRD.md) — stack, API, version/config contract।
5. [Schema.md](Schema.md) — records, authorization, concurrency।
6. [Plan.md](Plan.md) — implementation order ও verification ledger।

কোড পরিবর্তনের আগে এই ছয়টি পড়ুন। User-এর নতুন task অনুযায়ী প্রয়োজনীয় contract/acceptance আগে আপডেট করুন; এরপর implementation। Documentation baseline-কে ব্যবহারকারীর বর্তমান স্পষ্ট নির্দেশের বিকল্প করবেন না, routine reversible কাজে নতুন approval gate যোগ করবেন না।

## Engineering constraints

- বর্তমান vanilla frontend, Netlify Functions ও Firebase রাখুন, যদি task অন্য সিদ্ধান্ত না চায়।
- Schema/auth/version contract নির্ধারণ ও backend validation/test আগে; তারপর frontend binding। External setup blocked হলে independent mock/UI কাজ করুন; live verified দাবি নয়।
- User-visible ভাষা বাংলা; ছোট ও ব্যবহারযোগ্য copy।
- Secret শুধু server environment; production token/log/.env artifact নয়।
- Owner authorization, draft-version approval, transaction lock, DRY_RUN ও uncertain-publication block দুর্বল করবেন না।
- Network side effect transaction callback-এর বাইরে। নতুন user scope অনুযায়ী routines ও scheduling অন্তর্ভুক্ত। স্থায়ী autonomy settings ও routine allowWrites মেনে কাজ হবে; অনিশ্চিত write নিজে থেকে retry নয়।
- Version অনুমান নয়: package-lock, existing imports, actual config দেখুন। Required dependency পরিবর্তনে lock এবং TRD আপডেট করুন।
- Code/docs/features একই scope-এ রাখুন; এই instructions পরিবর্তন করলে blueprint links অক্ষত রাখুন।

## Validation and handoff

Code change-এর পরে `npm run build` চালান (checks + tests)। Failure সংশোধন করুন। নতুন unresolved concern না থাকলে একই checks অকারণে বারবার নয়। Docs-only change-এ links, file names ও code claims মিলিয়ে দেখুন; runtime tests পুনরায় চালানো বাধ্যতামূলক নয়।

Pending live Firebase/Meta/OpenAI/device test completed বলবেন না। Plan.md-এ যা পরীক্ষা হয়নি unchecked রাখুন। Handoff-এ ফল, artifact ও গুরুত্বপূর্ণ limitation সংক্ষেপে বাংলায় দিন।

## Executable blueprint workflow

ছয়টি নথির `json blueprint` block-ও পড়ুন। `npm run build` প্রথমে scripts/blueprints.mjs দিয়ে সেগুলো যাচাই করে public/project-contract.js ও public/design-tokens.css তৈরি করে। এগুলো generated output; সরাসরি edit নয়। Server ও browser একই contract import করে। UI-এর অন্য design values এবং বাংলা prose নিজে থেকে ব্যাখ্যা করা হয় না।

Code change-এর পরে build চালিয়ে generated output commit/package-এ রাখুন। Dependency/setup change হলে TRD block ও manifest/lock/config মেলান। Plan-এর required tests সরিয়ে বা build gate bypass করে green result দেখাবেন না। নতুন behavior/prose-এর জন্য প্রয়োজনীয় test নিজে তৈরি করুন; machine block থাকার কারণে সব requirement enforce হয় না।
