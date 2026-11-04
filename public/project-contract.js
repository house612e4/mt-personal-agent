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
        "generate_image",
        "merge_code_change",
        "deployment_status",
        "list_code"
      ],
      "maxSteps": 8,
      "maxDailyAiCalls": 1000,
      "maxDailyImages": 50,
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
      "oauth": "oauth"
    },
    "pageSize": 50,
    "maxBodyLength": 16000,
    "aiMaxDaily": 100,
    "aiMinIntervalMs": 10000
  }
};
