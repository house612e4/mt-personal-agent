// Generated from the six root blueprints. Edit the blueprints, then run npm run build.
export default {
  "product": {
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
        "url": "https://www.facebook.com/profile.php?id=410455022157073",
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
        "list_code",
        "communication_action"
      ],
      "name": "আরমান",
      "creditRule": "শুধু দেওয়া কাজটুকু করো। বাড়তি ধাপ, AI কল, ছবি তৈরি বা সম্পাদনা এবং অতিরিক্ত পোস্ট বাদ দাও। সংযুক্ত ছবি যেমন আছে তেমনই ব্যবহার করো।",
      "maxSteps": 12,
      "maxDailyAiCalls": 1000,
      "pollMs": 7000,
      "workerBatchSize": 5,
      "routineScanLimit": 100
    }
  },
  "flow": {
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
  },
  "ui": {
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
  },
  "tech": {
    "firebaseAdmin": "14.5.0",
    "webPush": "4.0.0",
    "firebaseWebSdk": "11.10.0",
    "globOverride": "14.0.3",
    "nodeMajor": 22,
    "publishDirectory": "public",
    "functionsDirectory": "netlify/functions"
  },
  "schema": {
    "paths": {
      "owners": "owners",
      "drafts": "drafts",
      "limits": "limits",
      "ai": "ai",
      "jobs": "jobs",
      "routines": "routines",
      "reports": "reports",
      "config": "config",
      "events": "events",
      "oauth": "oauth",
      "memories": "memories"
    },
    "pageSize": 50,
    "maxBodyLength": 16000,
    "aiMaxDaily": 100,
    "aiMinIntervalMs": 10000
  }
};
