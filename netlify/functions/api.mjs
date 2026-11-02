import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { AppError, RemoteError, accountInfo, account, text, draftId, revision, expectedVersion, checkVersion, publishingAllowed, graphSettings, remoteJSON } from '../../server/core.mjs';
const env = process.env;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });
function required(key) {
  if (!env[key]?.trim()) throw new AppError(503, `সেটআপ বাকি: ${key}`);
  return env[key].trim();
}
function services() {
  if (!getApps().length) {
    let credentials;
    try { credentials = JSON.parse(required('FIREBASE_SERVICE_ACCOUNT_JSON')); }
    catch (e) { if (e.status) throw e; throw new AppError(503, 'Firebase service account সেটিং সঠিক নয়।'); }
    if (credentials.project_id !== required('FIREBASE_PROJECT_ID')) throw new AppError(503, 'Firebase project ও service account মিলছে না।');
    initializeApp({ credential: cert(credentials), projectId: env.FIREBASE_PROJECT_ID });
  }
  return { auth: getAuth(), db: getFirestore() };
}
async function graph(a, path, body) {
  const settings = graphSettings(env, a);
  return remoteJSON(`https://graph.facebook.com/${settings.version}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${settings.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }, 'Facebook');
}
export function createHandler({ getServices = services, graphCall = graph, remoteCall = remoteJSON } = {}) {
  return async event => {
    try {
      const action = event.queryStringParameters?.action || 'config';
      if (action === 'config' && event.httpMethod === 'GET') {
        const ready = ['FIREBASE_WEB_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID', 'OWNER_UID', 'FIREBASE_SERVICE_ACCOUNT_JSON'].every(k => !!env[k]?.trim());
        return reply(200, { ready, firebase: ready ? { apiKey: env.FIREBASE_WEB_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, projectId: env.FIREBASE_PROJECT_ID, appId: env.FIREBASE_APP_ID } : null });
      }
      if (event.httpMethod !== 'POST') throw new AppError(405, 'POST প্রয়োজন।');
      const origin = event.headers?.origin;
      if (origin) {
        let host; try { const u = new URL(origin); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); host = u.host; }
        catch { throw new AppError(403, 'অনুমোদিত সাইট থেকে চেষ্টা করুন।'); }
        if (host !== event.headers?.host) throw new AppError(403, 'অনুমোদিত সাইট থেকে চেষ্টা করুন।');
      }
      const token = (event.headers?.authorization || '').match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new AppError(401, 'প্রথমে লগইন করুন।');
      const { auth, db } = getServices();
      let user; try { user = await auth.verifyIdToken(token, true); } catch { throw new AppError(401, 'লগইন মেয়াদ শেষ। আবার লগইন করুন।'); }
      if (user.uid !== required('OWNER_UID')) throw new AppError(403, 'এই অ্যাপ শুধু মালিকের জন্য।');
      if ((event.body || '').length > 16000) throw new AppError(413, 'অনুরোধ খুব বড়।');
      let b; try { b = JSON.parse(event.body || '{}'); } catch { throw new AppError(400, 'অনুরোধ সঠিক নয়।'); }
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError(400, 'অনুরোধ সঠিক নয়।');
      const drafts = db.collection('owners').doc(user.uid).collection('drafts');
      if (action === 'status') return reply(200, { dryRun: env.DRY_RUN !== 'false', ai: !!env.OPENAI_API_KEY, accounts: accountInfo.map(({ prefix, ...a }) => ({ ...a, connected: a.kind === 'page' && !!env[`${prefix}_PAGE_TOKEN`] && !!env[`${prefix}_PAGE_ID`] && !!env.META_GRAPH_VERSION })) });
      if (action === 'list') {
        let query = drafts.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
        if (b.cursor) {
          if (typeof b.cursor.createdAt !== 'string' || !Number.isFinite(Date.parse(b.cursor.createdAt))) throw new AppError(400, 'তালিকার অবস্থান সঠিক নয়।');
          query = query.startAfter(b.cursor.createdAt, draftId(b.cursor.id));
        }
        const snap = await query.limit(51).get();
        const rows = snap.docs.slice(0, 50).map(d => ({ ...d.data(), id: d.id, version: revision(d.data()) }));
        const last = rows.at(-1);
        return reply(200, { drafts: rows, cursor: snap.docs.length > 50 ? { id: last.id, createdAt: last.createdAt } : null });
      }
      if (action === 'save') {
        const a = account(b.accountKey), value = text(b.text), version = expectedVersion(b.expectedVersion);
        const ref = drafts.doc(b.id ? draftId(b.id) : randomUUID());
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (snap.exists) {
            if (snap.data().status !== 'draft') throw new AppError(409, 'এই পোস্ট আর সম্পাদনা করা যাবে না।');
            checkVersion(snap.data(), version);
            if (snap.data().accountKey !== a.key) throw new AppError(409, 'এক খসড়ার অ্যাকাউন্ট পরিবর্তন করা যাবে না। নতুন খসড়া তৈরি করুন।');
          } else if (version !== 0) throw new AppError(409, 'খসড়াটি মুছে গেছে। তালিকা আবার খুলুন।');
          tx.set(ref, { accountKey: a.key, text: value, status: 'draft', version: version + 1, createdAt: snap.exists ? snap.data().createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() });
        });
        return reply(200, { id: ref.id, version: version + 1 });
      }
      if (action === 'delete') {
        const ref = drafts.doc(draftId(b.id));
        await db.runTransaction(async tx => { const s = await tx.get(ref); if (!s.exists) throw new AppError(404, 'খসড়া নেই।'); checkVersion(s.data(), b.expectedVersion); if (s.data().status !== 'draft') throw new AppError(409, 'শুধু খসড়া মুছতে পারবেন।'); tx.delete(ref); });
        return reply(200, { ok: true });
      }
      if (action === 'generate') {
        const a = account(b.accountKey), topic = text(b.topic, 1500), key = required('OPENAI_API_KEY');
        const limit = db.collection('owners').doc(user.uid).collection('limits').doc('ai');
        await db.runTransaction(async tx => {
          const s = await tx.get(limit), old = s.data() || {}, now = Date.now(), day = new Date().toISOString().slice(0, 10), same = old.day === day;
          if (now - (old.last || 0) < 10000 || (same && old.count >= 100)) throw new AppError(429, 'কিছুক্ষণ অপেক্ষা করুন। দিনে সর্বোচ্চ ১০০টি লেখা তৈরি করা যায়।');
          tx.set(limit, { last: now, day, count: same ? (old.count || 0) + 1 : 1 });
        });
        const data = await remoteCall('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: 700, messages: [
            { role: 'system', content: `Write one natural Bengali Facebook post under 900 characters for ${a.kind === 'personal' ? 'a personal profile' : 'a business page'}. No invented prices, offers, results, contacts or addresses. No emojis unless requested. At most 3 relevant hashtags. Return post text only.` },
            { role: 'user', content: `Account: ${a.label}\nTopic: ${topic}` }
          ] })
        }, 'AI');
        const value = data.choices?.[0]?.message?.content;
        if (typeof value !== 'string' || !value.trim() || value.length > 1024 || data.choices?.[0]?.finish_reason === 'length') throw new AppError(502, 'AI-এর লেখাটি অসম্পূর্ণ বা বেশি বড় হয়েছে। বিষয়টি সংক্ষিপ্ত করে আবার চেষ্টা করুন।');
        return reply(200, { text: value.trim() });
      }
      if (action === 'insights') {
        const a = account(b.accountKey); if (a.kind !== 'page') throw new AppError(400, 'এই তথ্য শুধু পেজের জন্য।');
        const { pageId } = graphSettings(env, a);
        const page = await graphCall(a, `${pageId}?fields=id,name,followers_count,fan_count`);
        const posts = await graphCall(a, `${pageId}/posts?fields=id,message,created_time,permalink_url&limit=5`);
        return reply(200, { page, posts: Array.isArray(posts.data) ? posts.data : [] });
      }
      if (action === 'publish') {
        const ref = drafts.doc(draftId(b.id)); let d, a, settings, lockedVersion;
        await db.runTransaction(async tx => {
          const s = await tx.get(ref); if (!s.exists) throw new AppError(404, 'খসড়া নেই।');
          d = s.data(); a = account(d.accountKey); publishingAllowed(env, a, b.approved);
          checkVersion(d, b.expectedVersion);
          if (d.status !== 'draft') throw new AppError(409, 'এই পোস্ট আগে পাঠানো হয়েছে বা প্রক্রিয়াধীন।');
          settings = graphSettings(env, a); text(d.text); lockedVersion = revision(d) + 1;
          tx.update(ref, { status: 'publishing', version: lockedVersion, attemptedAt: new Date().toISOString() });
        });
        let result;
        try {
          result = await graphCall(a, `${settings.pageId}/feed`, { message: d.text });
          if (typeof result.id !== 'string' || !/^\d+_\d+$/.test(result.id)) throw new RemoteError('পোস্টের ফল নিশ্চিত নয়।');
        } catch (e) {
          const definite = e instanceof RemoteError && e.definite;
          await ref.update({ status: definite ? 'draft' : 'review_required', version: lockedVersion + 1 });
          throw new AppError(502, definite ? 'Facebook অনুরোধটি গ্রহণ করেনি। token/অনুমতি ঠিক করে নতুন করে অনুমোদন দিন।' : 'প্রকাশের ফল নিশ্চিত নয়। Facebook পেজ দেখে নিন। একই পোস্ট আবার পাঠানো বন্ধ রাখা হয়েছে।');
        }
        await ref.update({ status: 'published', postId: result.id, version: lockedVersion + 1, publishedAt: new Date().toISOString() });
        return reply(200, { ok: true, postId: result.id });
      }
      if (action === 'reconcile') {
        if (b.verified !== true) throw new AppError(400, 'আগে Facebook পেজে ফল যাচাই করুন।');
        const ref = drafts.doc(draftId(b.id));
        if (!['published', 'not_published'].includes(b.resolution)) throw new AppError(400, 'সঠিক ফল বাছুন।');
        if (b.resolution === 'published' && (typeof b.postId !== 'string' || !/^\d+_\d+$/.test(b.postId))) throw new AppError(400, 'Facebook post ID দিন: pageID_postID');
        await db.runTransaction(async tx => {
          const s = await tx.get(ref); if (!s.exists) throw new AppError(404, 'খসড়া নেই।');
          const d = s.data(); checkVersion(d, b.expectedVersion);
          if (!['publishing', 'review_required'].includes(d.status)) throw new AppError(409, 'এই পোস্টের পুনরুদ্ধার প্রয়োজন নেই।');
          if (!Number.isFinite(Date.parse(d.attemptedAt)) || Date.now() - Date.parse(d.attemptedAt) < 120000) throw new AppError(409, 'প্রকাশের চেষ্টার পর অন্তত ২ মিনিট অপেক্ষা করে ফল যাচাই করুন।');
          if (b.resolution === 'published' && !b.postId.startsWith(graphSettings(env, account(d.accountKey)).pageId + '_')) throw new AppError(400, 'Post ID নির্বাচিত পেজের নয়।');
          tx.update(ref, { status: b.resolution === 'published' ? 'published' : 'draft', version: revision(d) + 1, reconciledAt: new Date().toISOString(), ...(b.resolution === 'published' ? { postId: b.postId, publishedAt: new Date().toISOString() } : {}) });
        });
        return reply(200, { ok: true });
      }
      throw new AppError(404, 'এই কাজটি পাওয়া যায়নি।');
    } catch (e) { return reply(e.status || 500, { error: e.status ? e.message : 'কাজ সম্পন্ন হয়নি। তালিকা আবার খুলে অবস্থা দেখুন।' }); }
  };
}
export const handler = createHandler();
