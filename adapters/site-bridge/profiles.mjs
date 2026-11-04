const resource=(collection,filters=[])=>({collection,filters});
export const PROFILES={
 'mt-studio':{domain:'mt-studio-ai.com',resources:{
  customers:resource('users'),payments:resource('manualPayments',['status','owner']),records:resource('records',['owner','kind']),files:resource('files',['owner']),contests:resource('contests',['status']),competitions:resource('competitions',['status']),entries:resource('contestEntries',['contestId']),claims:resource('competitionClaims',['status','competitionId']),audit:resource('adminAudit'),
 },singletons:{brand:['settings','brand'],policies:['settings','policies']},overview:['payments','customers','contests','claims'],writes:{
  'brand.update':{fields:['data'],note:'Partial brand settings patch; current document merged then existing validateBrand applied.'},
  'policies.update':{fields:['data'],note:'terms/privacy/refund; existing validator; brand policy links updated atomically.'},
  'contests.save':{fields:['data'],note:'Existing validateContest; UUID id, no entrants. New record: read missing id for revision first.'},
  'contests.close':{fields:[],note:'Close existing photo contest; winners unchanged.'},
  'payments.review':{fields:['decision','reason','verificationReference'],financial:true,note:'approve/reject/reopen. Approval requires owner-provided banking verification reference; no bank access.'},
  'credits.adjust':{fields:['credits','reason'],financial:true,note:'Set existing verified customer credit balance, preserve adminAudit and records.'}
 }},
 'golapi-shop':{domain:'golapishop.online',resources:{
  orders:resource('orders',['status','userId','driverId']),products:resource('products',['zone','status','category']),customers:resource('users'),staff:resource('staff',['role','status']),drivers:resource('drivers'),tickets:resource('support_tickets',['status','priority']),refunds:resource('refund_requests',['status']),payouts:resource('payoutRequests',['status','driverId']),coupons:resource('coupons'),stock:resource('stock_logs'),purchaseOrders:resource('purchase_orders',['status']),campaigns:resource('marketing_campaigns',['status']),escalations:resource('escalations',['status']),companyAudit:resource('settings_audit_logs'),
 },singletons:{store:['setting','store'],delivery:['setting','delivery'],branches:['setting','branches'],deliveryZones:['setting','delivery_zones'],company:['company_settings','general']},overview:['orders','products','tickets','refunds'],writes:{
  'products.update':{fields:['data'],note:'Existing product descriptive/price/stock fields; protected sold/zone/group counters cannot be patched.'},
  'store.update':{fields:['data'],note:'storeAnnouncement/storeHours/deliveryMin/deliveryMax/expressCharge.'},
  'orders.note':{fields:['note'],note:'Internal adminNote only; no customer message.'},
  'orders.transition':{fields:['status','reason'],note:'One valid step; pickup/delivery also require active assigned staff driver and accepted delivery.'},
  'orders.assign':{fields:['driverId'],note:'Accept staff UID or legacy driver id; resolve exact unique phone link to active staff UID, store that UID. No implicit notification send.'},
  'orders.cancel':{fields:['reason'],financial:true,note:'Before pickup; regular order wallet/coupon/stock restored atomically once. Custom-bazar advance requires separate manual refund.'},
  'payments.review':{fields:['decision','reason','verificationReference'],financial:true,note:'verified/mismatch for submitted regular bKash/Nagad payments; never process bank refund.'},
  'tickets.update':{fields:['status','priority'],note:'Internal status/priority update only; no reply/send.'}
 }}
};
export function actionInfo(site,action){const p=PROFILES[site];if(!p)return null;if(['capabilities','overview'].includes(action))return{write:false};if(p.writes[action])return{write:true,...p.writes[action]};const [r,a,...extra]=String(action).split('.');if(!extra.length&&(a==='list'&&p.resources[r]||a==='get'&&(p.resources[r]||p.singletons[r])))return{write:false};return null;}
export function capabilities(site,env={}){const p=PROFILES[site];return{protocol:'mt-agent-site/3.1',site,domain:p.domain,reads:['capabilities','overview',...Object.keys(p.resources).flatMap(k=>[k+'.list',k+'.get']),...Object.keys(p.singletons).map(k=>k+'.get')],resources:p.resources,singletons:Object.keys(p.singletons),writes:Object.fromEntries(Object.entries(p.writes).map(([name,v])=>[name,{...v,enabled:env.AGENT_BRIDGE_ALLOW_WRITES==='true'&&(!v.financial||env.AGENT_BRIDGE_FINANCIAL_WRITES==='true'),requires:['expectedRevision',...v.fields]}])),pagination:{patch:{limit:'1..10 (default 5)',after:'previous next cursor',filter:'optional exact {field,value}; fields listed per resource'},order:'document ID, not newest first',coverage:'Explicit bounded pages; not all records. Never claim full audit without fetching all pages.'},limits:{fullData:false,externalBankRefund:false,arbitraryCollectionAccess:false,customerMessageSend:false}};}
