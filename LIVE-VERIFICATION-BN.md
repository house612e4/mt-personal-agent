# Live verification record

Deploy-এর পরে এই টেবিল পূরণ করুন। Secret, token বা private key লিখবেন না।

| পরীক্ষা | প্রত্যাশিত ফল | বাস্তব ফল | সময় |
| --- | --- | --- | --- |
| OpenAI model | Model ID live check সফল |  |  |
| Gmail OAuth | নিজের email profile পাওয়া গেছে |  |  |
| WhatsApp | নির্ধারিত business number পাওয়া গেছে |  |  |
| Telegram | নিজের bot username পাওয়া গেছে |  |  |
| MT Studio Facebook | সঠিক Page নাম/ID |  |  |
| Golapi Facebook | সঠিক Page নাম/ID |  |  |
| Instagram accounts | সঠিক username/ID |  |  |
| MT Studio bridge | `mt-agent-site/3.1` capabilities |  |  |
| Golapi bridge | `mt-agent-site/3.1` capabilities |  |  |
| Push test | App বন্ধ অবস্থায় notification |  |  |
| Image upload | মূল bytes, সর্বোচ্চ ১০ MB |  |  |
| Video upload | raw signed upload, সর্বোচ্চ ১০০ MB |  |  |
| Scheduled routine | পাঁচ মিনিটের scheduler window-তে কাজ |  |  |
| Duplicate protection | একই request একবারই execute |  |  |

সব প্রয়োজনীয় row সফল না হওয়া পর্যন্ত production autonomy একসঙ্গে চালু করবেন না।
