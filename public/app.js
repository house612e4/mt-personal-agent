import {mountAgent} from './agent-ui.js';
import contract from './project-contract.js';
const $ = id => document.getElementById(id);
const accounts = contract.product.accounts.map(({prefix, ...a}) => a);
let selected = 'mt-studio', editing = null, editingVersion = 0, dirty = false;
let drafts = [], cursor = null, demo = false, auth = null, fb = null, user = null, status = null, busy = false;
let authReady = false, signingIn = false, sessionEpoch = 0, listEpoch = 0;
const labels = { draft: 'খসড়া', publishing: 'প্রক্রিয়াধীন', published: 'প্রকাশিত', review_required: 'পেজে গিয়ে ফল দেখুন' };
let toastTimer;
function toast(message) {
  $('toast').textContent = message; $('toast').style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').style.display = 'none'; }, 6000);
}
function safe(tag, cls, content) {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (content !== undefined) e.textContent = content; return e;
}
function errorText(e) {
  if (e.code?.startsWith('auth/')) return ({
    'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।',
    'auth/network-request-failed': 'ইন্টারনেট সংযোগ পরীক্ষা করুন।',
    'auth/too-many-requests': 'বেশি চেষ্টা হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।',
    'auth/invalid-email': 'সঠিক ইমেইল দিন।',
    'auth/user-disabled': 'এই অ্যাকাউন্ট বন্ধ আছে।'
  })[e.code] || 'লগইন সম্পন্ন হয়নি। ইমেইল, পাসওয়ার্ড ও Firebase সেটআপ পরীক্ষা করুন।';
  return e.message || 'কাজ সম্পন্ন হয়নি।';
}
function controls() {
  document.querySelectorAll('button, input, textarea, select').forEach(e => {
    if (e.closest('dialog')) return;
    e.disabled = busy || (e.id === 'loginButton' || e.id === 'reset') && !authReady || e.dataset.unavailable === 'true';
  });
}
async function run(button, fn) {
  if (busy) return;
  busy = true; const old = button.textContent; button.textContent = 'অপেক্ষা করুন…'; controls();
  try { await fn(); } catch (e) { toast(errorText(e)); }
  finally { button.textContent = old; busy = false; controls(); }
}
async function api(action, body = {}) {
  const activeUser = user;
  if (!activeUser || demo) throw Error('প্রথমে লগইন করুন।');
  const token = await activeUser.getIdToken();
  let res;
  try {
    res = await fetch('/.netlify/functions/api?action=' + action, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(contract.flow.clientTimeoutMs)
    });
  } catch { throw Error(action === 'publish' ? 'প্রকাশের উত্তর পাওয়া যায়নি। তালিকা আবার খুলে Facebook পেজে ফল যাচাই করুন।' : 'সার্ভারের উত্তর পাওয়া যায়নি। ইন্টারনেট পরীক্ষা করে তালিকা আবার খুলুন।'); }
  if (activeUser !== user || demo) throw Error('সেশন বদলেছে। আবার চেষ্টা করুন।');
  const data = await res.json().catch(() => ({ error: 'সার্ভারের সঠিক উত্তর পাওয়া যায়নি।' }));
  if (!res.ok) { const error = Error(data.error || 'কাজ সম্পন্ন হয়নি।'); error.status = res.status; throw error; }
  return data;
}
function tab(name, refresh = true) {
  document.querySelectorAll('.tab').forEach(e => { e.hidden = e.id !== name; });
  document.querySelectorAll('[data-tab]').forEach(e => e.classList.toggle('active', e.dataset.tab === name));
  $('app').classList.toggle('chat-open',name==='agent');
  $('pageTitle').textContent = { agent:contract.product.agent.name,routines:'কাজের রুটিন',reports:'দৈনিক রিপোর্ট',brain:'এজেন্টের ব্রেন',compose: 'নতুন পোস্ট', drafts: 'আমার খসড়া', insights: 'পেজের তথ্য', settings: 'সংযোগ ও সেটআপ' }[name];
  if (['agent','routines','reports','brain'].includes(name) && refresh) agentUI.refresh().catch(e=>toast(errorText(e)));
  if (name === 'drafts' && refresh) loadDrafts().catch(e => toast(errorText(e)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function confirmDiscard() { return !dirty || window.confirm('সংরক্ষণ না করা পরিবর্তন বাদ দেবেন?'); }
function resetEditor() {
  editing = null; editingVersion = 0; dirty = false; $('topic').value = ''; $('post').value = ''; preview();
}
function switchAccount(key) {
  if (busy || key === selected || !confirmDiscard()) return;
  selected = key; resetEditor(); accountUI();
}
function accountUI() {
  $('accounts').replaceChildren();
  for (const a of accounts) {
    const b = safe('button', 'account' + (a.key === selected ? ' active' : '')); b.type = 'button'; b.disabled = busy;
    b.setAttribute('aria-pressed', String(a.key === selected)); b.append(safe('span', 'avatar', a.initial));
    const label = safe('span', '', a.label); label.append(safe('small', '', a.kind === 'page' ? 'Facebook পেজ' : 'নিজের প্রোফাইল')); b.append(label);
    b.onclick = () => switchAccount(a.key); $('accounts').append(b);
  }
  const a = accounts.find(a => a.key === selected); $('previewName').textContent = a.label; $('previewAvatar').textContent = a.initial;
}
function preview() {
  const value = $('post').value; $('count').textContent = `${value.length} / ${contract.product.maxPostLength}`; $('previewText').textContent = value || 'আপনার লেখা এখানে দেখা যাবে।';
}
function demoLoad() {
  try {
    const data = JSON.parse(localStorage.getItem('mt-demo-drafts') || '[]');
    return Array.isArray(data) ? data.filter(d => d && typeof d.id === 'string' && typeof d.text === 'string' && accounts.some(a => a.key === d.accountKey)).map(d => ({ ...d, version: Number.isSafeInteger(d.version) ? d.version : 0 })) : [];
  } catch { return []; }
}
function saveDemo(rows) {
  try { localStorage.setItem('mt-demo-drafts', JSON.stringify(rows)); }
  catch { throw Error('এই ব্রাউজারে খসড়া রাখা যায়নি। স্টোরেজ বা private browsing সেটিং দেখুন।'); }
  drafts = rows;
}
async function enter() {
  const epoch = ++sessionEpoch;
  const next = demo ? { dryRun: true, ai: false, accounts: [] } : await api('status');
  if (epoch !== sessionEpoch) return;
  status = next; drafts = demo ? demoLoad() : []; cursor = null;
  accountUI(); preview(); $('welcome').hidden = true; $('app').hidden = false;
  $('mode').textContent = demo ? 'ডেমো চলছে · খসড়া শুধু এই ব্রাউজারে থাকবে · AI ও প্রকাশ বন্ধ' : status.dryRun ? 'পরীক্ষামূলক মোড · Facebook প্রকাশ বন্ধ' : 'আপনার কর্মক্ষেত্র · এজেন্টের অনুমতি ব্রেন সেটিংসে নিয়ন্ত্রিত';
  connections(); tab('agent'); controls();
}
function connections() {
  const box = $('connections'); box.replaceChildren();
  const rows = [['Firebase লগইন', !demo], ['OpenAI', !demo && status?.ai], ...accounts.filter(a => a.kind === 'page').map(a => [a.label, !demo && status?.accounts?.find(s => s.key === a.key)?.connected])];
  for (const [name, connected] of rows) {
    const row = safe('div', 'connection'); row.append(safe('span', '', name), safe('span', 'muted', connected ? 'সংযোগের তথ্য আছে' : 'সংযোগ বাকি')); box.append(row);
  }
  box.append(safe('p', 'muted', 'সংযোগের তথ্য থাকা মানেই token কার্যকর নয়। খসড়া সংরক্ষণ ও পেজের তথ্য খুলে প্রকৃত সংযোগ যাচাই করুন।'));
}
async function loadDrafts(more = false) {
  const epoch = ++listEpoch, session = sessionEpoch, mode = demo;
  const data = mode ? { drafts: demoLoad(), cursor: null } : await api('list', more && cursor ? { cursor } : {});
  if (epoch !== listEpoch || session !== sessionEpoch || mode !== demo) return;
  drafts = more ? [...drafts, ...data.drafts.filter(d => !drafts.some(old => old.id === d.id))] : data.drafts;
  cursor = data.cursor; renderDrafts();
}
function addAction(box, name, fn, cls = 'secondary') {
  const button = safe('button', cls, name); button.onclick = () => run(button, fn); box.append(button); return button;
}
async function reconcile(d) {
  const dialog = $('recovery'); dialog.returnValue = 'cancel';
  $('recoveryAccount').textContent = accounts.find(a => a.key === d.accountKey)?.label || '';
  $('recoveryResult').value = ''; $('recoveryPostId').value = ''; $('recoveryVerified').checked = false; $('recoveryError').textContent = '';
  $('recoverySubmit').onclick = () => {
    const resolution = $('recoveryResult').value, postId = $('recoveryPostId').value.trim();
    if (!$('recoveryVerified').checked || !resolution) { $('recoveryError').textContent = 'পেজে ফল যাচাই করে সঠিক ফল বাছুন।'; return; }
    if (resolution === 'published' && !/^\d+_\d+$/.test(postId)) { $('recoveryError').textContent = 'প্রকাশিত পোস্টের সঠিক ID দিন।'; return; }
    dialog.close('submit');
  };
  dialog.showModal();
  const approved = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'submit'), { once: true }));
  if (!approved) return;
  await api('reconcile', { id: d.id, expectedVersion: d.version, verified: true, resolution: $('recoveryResult').value, ...($('recoveryPostId').value.trim() ? { postId: $('recoveryPostId').value.trim() } : {}) });
  toast('পোস্টের অবস্থা আপডেট হয়েছে।'); await loadDrafts();
}
function renderDrafts() {
  const box = $('draftList'); box.replaceChildren();
  const rows = drafts.filter(d => $('filter').value === 'all' || d.accountKey === $('filter').value);
  if (!rows.length) box.append(safe('section', 'panel', cursor ? 'এই অংশে মেলেনি। আরও পুরোনো খসড়া দেখুন।' : 'এখনো কোনো খসড়া নেই। “লিখুন” থেকে শুরু করুন।'));
  for (const d of rows) {
    const a = accounts.find(a => a.key === d.accountKey); if (!a) continue;
    const card = safe('article', 'panel draft-card'), head = safe('div', 'section-head');
    head.append(safe('strong', '', a.label), safe('span', 'status', labels[d.status] || d.status));
    card.append(head, safe('small', '', new Date(d.createdAt).toLocaleString('bn-BD')), safe('p', 'draft-text', d.text));
    const actions = safe('div', 'actions');
    addAction(actions, 'কপি', async () => { try { await navigator.clipboard.writeText(d.text); toast('লেখা কপি হয়েছে।'); } catch { throw Error('কপি করা যায়নি। লেখার ওপর চেপে ধরে কপি করুন।'); } });
    if (d.status === 'draft') {
      addAction(actions, 'সম্পাদনা', async () => { if (!confirmDiscard()) return; selected = d.accountKey; editing = d.id; editingVersion = d.version || 0; dirty = false; $('post').value = d.text; $('topic').value = ''; accountUI(); preview(); tab('compose'); });
      addAction(actions, 'মুছুন', async () => {
        if (!window.confirm('এই খসড়াটি মুছবেন?')) return;
        try { if (demo) saveDemo(drafts.filter(x => x.id !== d.id)); else await api('delete', { id: d.id, expectedVersion: d.version }); }
        finally { await loadDrafts(); }
        if (editing === d.id) resetEditor();
      }, 'quiet danger');
      if (a.kind === 'page') {
        const button = addAction(actions, 'প্রকাশ', async () => {
          $('confirmAccount').textContent = a.label; $('confirmText').textContent = d.text;
          const dialog = $('confirm'); dialog.returnValue = 'cancel'; dialog.showModal();
          const approved = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'publish'), { once: true }));
          if (!approved) return;
          try { await api('publish', { id: d.id, expectedVersion: d.version, approved: true }); toast('পোস্ট প্রকাশ হয়েছে।'); }
          finally { await loadDrafts(); }
        }, 'primary');
        button.dataset.unavailable = String(demo || status?.dryRun || !status?.accounts?.find(s => s.key === d.accountKey)?.connected);
        button.title = button.dataset.unavailable === 'true' ? 'প্রকাশের মোড ও পেজের সংযোগ পরীক্ষা করুন।' : '';
      } else card.append(safe('p', 'muted', 'লেখা কপি করে নিজের Facebook প্রোফাইলে পোস্ট করুন।'));
    }
    const link = safe('a', 'post-link', d.postId ? 'Facebook-এ পোস্ট দেখুন ↗' : 'Facebook পেজ খুলুন ↗');
    link.href = /^\d+_\d+$/.test(d.postId || '') ? 'https://www.facebook.com/' + d.postId : a.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link);
    if (['review_required', 'publishing'].includes(d.status)) {
      card.append(safe('p', 'muted', 'পেজে গিয়ে প্রকাশের ফল দেখুন। অন্তত ২ মিনিট পরে “ফল যাচাই করেছি” দিয়ে অবস্থা ঠিক করতে পারবেন।'));
      if (!demo) addAction(actions, 'ফল যাচাই করেছি', () => reconcile(d));
    }
    card.append(actions); box.append(card);
  }
  $('more').hidden = !cursor; controls();
}
document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { if (!busy) tab(b.dataset.tab); }; });
document.querySelectorAll('[data-topic]').forEach(b => { b.onclick = () => { if (!busy) { $('topic').value = b.dataset.topic; dirty = true; } }; });
$('post').oninput = () => { dirty = true; preview(); }; $('topic').oninput = () => { dirty = true; };
$('filter').onchange = renderDrafts;
$('refresh').onclick = () => run($('refresh'), () => loadDrafts()); $('more').onclick = () => run($('more'), () => loadDrafts(true));
$('generate').onclick = () => run($('generate'), async () => {
  if (demo) throw Error('ডেমোতে AI সংযোগ নেই। নিচে নিজের লেখা দিয়ে খসড়া রাখতে পারবেন।');
  if (!$('topic').value.trim()) throw Error('পোস্টের বিষয় লিখুন।');
  if ($('post').value.trim() && !window.confirm('বর্তমান লেখার জায়গায় AI-এর নতুন লেখা আনবেন?')) return;
  const key = selected, topic = $('topic').value, epoch = sessionEpoch;
  const data = await api('generate', { accountKey: key, topic });
  if (selected !== key || sessionEpoch !== epoch) throw Error('অ্যাকাউন্ট বদলেছে। লেখাটি সংরক্ষণ করা হয়নি।');
  $('post').value = data.text; dirty = true; preview(); toast('লেখা তৈরি হয়েছে। দেখে খসড়া সংরক্ষণ করুন।');
});
$('save').onclick = () => run($('save'), async () => {
  const value = $('post').value.trim(); if (!value || value.length > contract.product.maxPostLength) throw Error(`১ থেকে ${contract.product.maxPostLength} অক্ষরের লেখা দিন।`);
  const id = editing || crypto.randomUUID(), version = editingVersion;
  editing = id;
  if (demo) {
    const old = drafts.find(d => d.id === id);
    if (old && (old.version || 0) !== version) throw Error('খসড়া বদলেছে। তালিকা আবার খুলুন।');
    const d = { id, version: version + 1, accountKey: selected, text: value, status: 'draft', createdAt: old?.createdAt || new Date().toISOString() };
    saveDemo([d, ...drafts.filter(x => x.id !== id)]); editingVersion = d.version;
  } else {
    const result = await api('save', { id, expectedVersion: version, accountKey: selected, text: value }); editingVersion = result.version;
  }
  dirty = false; toast('খসড়া সংরক্ষিত হয়েছে।'); await loadDrafts(); tab('drafts', false);
});
$('clear').onclick = () => { if (!busy && confirmDiscard()) resetEditor(); };
$('loadInsights').onclick = () => run($('loadInsights'), async () => {
  if (demo) throw Error('ডেমোতে Facebook-এর বাস্তব তথ্য পাওয়া যাবে না।');
  const data = await api('insights', { accountKey: $('insightAccount').value }), box = $('insightResult');
  box.replaceChildren(safe('h2', '', data.page.name), safe('div', 'metric', `অনুসারী: ${data.page.followers_count ?? 'অনুপলব্ধ'} · পেজ লাইক: ${data.page.fan_count ?? 'অনুপলব্ধ'}`));
  if (!data.posts.length) box.append(safe('p', 'muted', 'কোনো পোস্ট পাওয়া যায়নি।'));
  for (const p of data.posts) {
    let url; try { url = new URL(p.permalink_url || 'https://www.facebook.com/' + p.id); } catch { continue; }
    if (url.protocol !== 'https:' || !(url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))) continue;
    const link = safe('a', 'post-link', p.message || 'পোস্ট দেখুন'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
  }
});
function clearSession() {
  agentUI.reset();
  ++sessionEpoch; ++listEpoch; user = null; drafts = []; cursor = null; editing = null; editingVersion = 0; status = null; dirty = false;
  $('post').value = ''; $('topic').value = ''; $('draftList').replaceChildren(); $('insightResult').replaceChildren(); $('connections').replaceChildren(); $('previewText').textContent = '';
  $('confirm').close(); $('recovery').close(); $('confirmText').textContent = ''; $('recoveryPostId').value = '';  $('app').hidden = true; $('welcome').hidden = false;
}
$('demo').onclick = () => run($('demo'), async () => { demo = true; clearSession(); resetEditor(); await enter(); });
$('logout').onclick = () => run($('logout'), async () => {
  if (!confirmDiscard()) return;
  if (auth && !demo) await fb.signOut(auth);
  demo = false; clearSession();
});
$('loginForm').onsubmit = event => {
  event.preventDefault(); run($('loginButton'), async () => {
    if (!authReady) throw Error('সার্ভারের Firebase সেটআপ সম্পন্ন করুন।');
    signingIn = true; demo = false;
    try { const result = await fb.signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value); user = result.user; $('password').value = ''; await enter(); }
    catch (e) { await fb.signOut(auth).catch(() => {}); clearSession(); throw e; }
    finally { signingIn = false; }
  });
};
$('reset').onclick = () => run($('reset'), async () => {
  if (!authReady) throw Error('Firebase সেটআপ বাকি।');
  if (!$('email').value.trim()) throw Error('আগে ইমেইল লিখুন।');
  await fb.sendPasswordResetEmail(auth, $('email').value.trim()); toast('অ্যাকাউন্ট থাকলে পাসওয়ার্ড পরিবর্তনের ইমেইল পাবেন।');
});
async function boot() {
  controls();
  try {
    const res = await fetch('/.netlify/functions/api?action=config', { signal: AbortSignal.timeout(contract.flow.configTimeoutMs) });
    if (!res.ok) throw Error(); const config = await res.json(); if (!config.ready) throw Error();
    const app = await import(`https://www.gstatic.com/firebasejs/${contract.tech.firebaseWebSdk}/firebase-app.js`);
    fb = await import(`https://www.gstatic.com/firebasejs/${contract.tech.firebaseWebSdk}/firebase-auth.js`); auth = fb.getAuth(app.initializeApp(config.firebase));
    try { await fb.setPersistence(auth, fb.browserSessionPersistence); } catch { await fb.setPersistence(auth, fb.inMemoryPersistence); }
    authReady = true; $('setupNote').textContent = 'নিজের নির্ধারিত ইমেইল ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।'; controls();
    fb.onAuthStateChanged(auth, async u => {
      if (signingIn || demo) return;
      if (!u) { clearSession(); return; }
      user = u;
      try { await enter(); } catch (e) { if (demo || user !== u) return; await fb.signOut(auth).catch(() => {}); clearSession(); toast(errorText(e)); }
    });
  } catch {
    $('setupNote').textContent = 'সেটআপ বা সংযোগ যাচাই করা যায়নি। নেটওয়ার্ক ও Netlify সেটিং দেখে পেজ আবার খুলুন। ডেমো দেখতে পারেন।';
    authReady = false; controls();
  }
}
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
async function agentRequest(action,body={}) {
 if(demo)throw Error('ডেমোতে এজেন্টের cloud কাজ চলে না। লগইন ও সংযোগ সেটআপ করুন।');
 const active=user;if(!active)throw Error('লগইন করুন।');const token=await active.getIdToken();
 const response=await fetch('/.netlify/functions/agent?action='+action,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(active!==user)throw Error('সেশন বদলেছে।');if(!response.ok)throw Error(data.error||'কাজ হয়নি।');return data;
}
const agentUI=mountAgent({request:agentRequest,lock:value=>{busy=value;controls();}});
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
