import contract from '../public/project-contract.js';
export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class RemoteError extends AppError {
  constructor(message, definite = false) { super(502, message); this.definite = definite; }
}
export const accountInfo = contract.product.accounts;
export function account(key) {
  const result = accountInfo.find(a => a.key === key);
  if (!result) throw new AppError(400, 'অ্যাকাউন্ট সঠিক নয়।');
  return result;
}
export function text(value, max = contract.product.maxPostLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(400, `১ থেকে ${max} অক্ষরের লেখা দিন।`);
  return value.trim();
}
export function draftId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{10,64}$/.test(id)) throw new AppError(400, 'খসড়ার আইডি সঠিক নয়।');
  return id;
}
export const revision = draft => Number.isSafeInteger(draft?.version) ? draft.version : 0;
export function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new AppError(400, 'খসড়ার সংস্করণ নেই। তালিকা আবার খুলুন।');
  return value;
}
export function checkVersion(draft, value) {
  if (revision(draft) !== expectedVersion(value)) throw new AppError(409, 'খসড়া অন্য জায়গা থেকে বদলেছে। তালিকা আবার খুলে নতুন লেখাটি দেখুন।');
}
export function publishingAllowed(env, a, approved) {
  if (approved !== true) throw new AppError(400, 'পোস্ট প্রকাশের অনুমোদন দিন।');
  if (a.kind !== 'page') throw new AppError(400, 'ব্যক্তিগত প্রোফাইলে লেখা কপি করে নিজে পোস্ট করুন।');
  if (env.DRY_RUN !== 'false') throw new AppError(409, 'পরীক্ষামূলক মোড চালু। প্রকাশের জন্য Netlify-তে DRY_RUN=false করুন।');
}
export function graphSettings(env, a) {
  const read = key => { if (!env[key]?.trim()) throw new AppError(503, `সেটআপ বাকি: ${key}`); return env[key].trim(); };
  const version = read('META_GRAPH_VERSION');
  if (!/^v\d+\.\d+$/.test(version)) throw new AppError(503, 'META_GRAPH_VERSION সঠিক নয়।');
  const pageId = read(`${a.prefix}_PAGE_ID`);
  if (!/^\d+$/.test(pageId)) throw new AppError(503, 'Page ID সঠিক নয়।');
  return { version, pageId, token: read(`${a.prefix}_PAGE_TOKEN`) };
}
export async function remoteJSON(url, options = {}, label = 'সংযোগ') {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(contract.flow.providerTimeoutMs) }); }
  catch { throw new RemoteError(`${label} থেকে ফল পাওয়া যায়নি।`); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    // An explicit 4xx refusal is safe to correct and retry; transport/5xx outcomes remain uncertain.
    throw new RemoteError(`${label} ব্যর্থ। key/token, অনুমতি ও বিলিং পরীক্ষা করুন।`, response.status >= 400 && response.status < 500);
  }
  if (!data || typeof data !== 'object') throw new RemoteError(`${label} থেকে সঠিক উত্তর আসেনি।`);
  return data;
}
