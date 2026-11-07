# MT Personal Agent — UI specification v3.1

v3.1: Brain-এর connection অংশে প্রত্যেক website-এর বাস্তব signed probe button ও তার ফল। Setting উপস্থিতি এবং actual probe আলাদা করে দেখাবে।


মোবাইল আগে, বাংলা copy, system font stack, readable text এবং wrap হওয়া controls। ৬৫০px ও ১০৫০px layout breakpoints। নিচের JSON-এর মূল চার রং generated design-tokens.css-এ যায়; বাকি CSS public/style.css-এ। Generated file হাতে edit নয়।

## পর্দা ও controls

- Agent: সাম্প্রতিক ২০ job, Reports-এ সাম্প্রতিক ১০ report; পুরোনো report ID দিয়ে সংশোধন করা যায়, পূর্ণ report pagination নেই।
- আরমান: সবুজ header, মালিকের বাবল ও পাঠান বোতাম। নামের পাশে ঐচ্ছিক গোল avatar, ছবি বাছাই একই ব্রাউজারে থাকে। “আজকের কাজ” থেকে সম্পন্ন, বাকি ও যাচাইয়ের অবস্থা দেখা যায়। ছবি বাছাই করে পাঠালেই মূল ফাইল আপলোড হয়।
- Routines: ঐচ্ছিক মাসভিত্তিক কাজের তালিকা একই পর্দায়। দিন, সময়, IANA timezone, command, enabled এবং বাইরের পরিবর্তনের অনুমতি; existing routine edit/pause।
- Reports: শিরোনাম, ID/version, লেখা, expandable evidence/coverage, versioned editor।
- Brain: text model, instructions, memory, timezone, steps, AI daily budget, তিন autonomy flag ও tool allowlist।
- Settings: connection presence, Gmail OAuth, deployment setup। “সেটিং আছে” মানেই live token কার্যকর নয়।
- আগের posting/drafts/account tools shortcut থেকে খোলা যায়।

Request চললে shared busy lock controls ধরে। Agent jobs শুধু সক্রিয় পর্দা ও due/running কাজ থাকলে নির্দিষ্ট interval-এ poll হয়। Sensitive report, message ও job ফল textContent দিয়ে render হয়; external HTML execute নয়। Brain form dirty থাকলে background refresh লেখা overwrite করে না। Logout-এ state/timer/private rendered content পরিষ্কার।

PWA manifest, icons ও service-worker shell caching রয়েছে। Offline cloud execution চলে না; ফোন offline হলেও deployed server-এর আগে-সেভ করা routine চলতে পারে। বাস্তব Android/iPhone visual/installation পরীক্ষা এখনো বাকি।

## Build contract

```json blueprint
{
  "colors": {
    "--green": "#164d40",
    "--line": "#dde4db",
    "--page-bg": "#f4f5ef",
    "--text": "#193c35"
  },
  "breakpoints": [
    650,
    1050
  ]
}
```
