import {PROFILES,actionInfo,capabilities} from './profiles.mjs';
import {fail,exact,object,text,docId,number,choice,https,expect,view,atomic} from './common.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createDomain({site,db,env={},validators={},getUser}){
 const profile=PROFILES[site];if(!profile)fail(503,'Site profile পাওয়া যায়নি।');
 const ref=(resource,id)=>{const singleton=profile.singletons[resource];return singleton?db.collection(singleton[0]).doc(singleton[1]):db.collection(profile.resources[resource].collection).doc(docId(id));};
 async function list(resource,patch={}){
  exact(patch,['limit','after','filter']);const spec=profile.resources[resource];if(!spec)fail(400,'এই resource নেই।');
  const limit=patch.limit??5;number(limit,10,true);if(limit<1)fail(400,'Page limit ১–১০ দিন।');
  let query=db.collection(spec.collection);
  if(patch.filter!==undefined){exact(patch.filter,['field','value']);if(!spec.filters.includes(patch.filter.field)||!['string','number','boolean'].includes(typeof patch.filter.value)||String(patch.filter.value).length>128)fail(400,'অনুমোদিত filter দিন।');query=query.where(patch.filter.field,'==',patch.filter.value);}
  query=query.orderBy('__name__');if(patch.after)query=query.startAfter(docId(patch.after));const result=await query.limit(limit+1).get(),rows=result.docs.slice(0,limit);
  return{items:rows.map(view),next:result.size>limit?rows.at(-1).id:null,coverage:{loaded:rows.length,hasMore:result.size>limit,order:'document ID ascending; not newest first',projection:'secrets removed; strings/nesting/arrays capped'}};
 }
 async function read(b){const [resource,action]=b.action.split('.');if(b.action==='capabilities')return capabilities(site,env);
  if(b.action==='overview'){const resources={};for(const name of profile.overview)resources[name]=await list(name,{limit:2});return{site,resources,coverage:'First two document-ID ordered records per listed resource; not daily totals or all records. Use resource.list pages and get exact record before changing it.'};}
  if(action==='list')return list(resource,b.patch||{});return view(await ref(resource,b.documentId).get());
 }
 function update(tx,target,data,{merge=true}={}){tx.set(target,data,{merge});}
 async function mutate(b){
  const info=profile.writes[b.action];exact(b.patch,['expectedRevision',...info.fields]);const patch=b.patch,now=site==='golapi-shop'?new Date():new Date().toISOString();
  if(site==='mt-studio'&&b.action==='credits.adjust'){
   if(!getUser)fail(503,'Customer auth lookup সংযোগ বাকি।');const u=await getUser(docId(b.documentId));if(u.disabled||!u.emailVerified)fail(409,'গ্রাহকের সক্রিয় verified account প্রয়োজন।');
  }
  return atomic(db,b,async tx=>{
   const [resource]=b.action.split('.'),target=ref(b.action==='credits.adjust'?'customers':site==='golapi-shop'&&resource==='payments'?'orders':resource,b.documentId),snapshot=await tx.get(target),old=snapshot.data();
   expect(snapshot,patch.expectedRevision,{create:['brand.update','policies.update','contests.save','store.update'].includes(b.action)});
   let data;const result={ok:true,site,action:b.action,id:target.id};const writes=[];
   const set=(r,d)=>writes.push(()=>update(tx,r,d)),create=(r,d)=>writes.push(()=>tx.create(r,d));
   if(site==='mt-studio'){
    if(b.action==='brand.update'){
     if(!validators.validateBrand)fail(503,'Existing site validator সংযোগ বাকি।');if(!object(patch.data))fail(400,'Brand data object দিন।');
     const candidate={...(old||{}),...patch.data};data=validators.validateBrand(candidate);if(!data||Object.keys(patch.data).some(k=>!Object.hasOwn(data,k)))fail(400,'ব্র্যান্ডের তথ্য বা HTTPS লিংক সঠিক নয়।');set(target,{...data,updatedAt:now,updatedBy:'personal-agent'});
    }else if(b.action==='policies.update'){
     exact(patch.data,['terms','privacy','refund']);data=validators.validatePolicies?.({...old,...patch.data});if(!data)fail(400,'নীতিমালার প্রতিটি লেখা খালি অথবা ৫০–৫০,০০০ অক্ষর দিন।');
     set(target,{...data,updatedAt:now,updatedBy:'personal-agent'});set(db.collection('settings').doc('brand'),Object.fromEntries(['terms','privacy','refund'].map(k=>[k+'Url',data[k]?'https://'+profile.domain+'/policies/'+k:''])));
    }else if(b.action==='contests.save'){
     if(!uuid(b.documentId))fail(400,'Contest ID UUID আকারে দিন।');data=validators.validateContest?.(patch.data);if(!data)fail(400,'প্রতিযোগিতার title/description/rules/prize/time/status সঠিক নয়।');if(Number(old?.entryCount)>0)fail(409,'অংশগ্রহণ শুরু হলে নিয়ম বদলানো যাবে না।');
     set(target,{...data,created:old?.created||now,entryCount:old?.entryCount||0,winners:old?.winners||[],updatedBy:'personal-agent'});
    }else if(b.action==='contests.close'){set(target,{status:'closed'});
    }else if(b.action==='payments.review'){
     const decision=choice(patch.decision,['approve','reject','reopen']),reason=text(patch.reason,300,5);
     if(decision==='reopen'){if(old.status!=='rejected')fail(409,'শুধু rejected payment আবার খোলা যায়।');set(target,{status:'pending',reason,reopened:true,reopenedBy:'personal-agent',reopenedAt:now});}
     else{
      if(old.status!=='pending')fail(409,'এই পেমেন্টের সিদ্ধান্ত আগে হয়েছে।');const status=decision==='approve'?'approved':'rejected';
      if(decision==='approve'){
       const verificationReference=text(patch.verificationReference,300,8);if(!['bkash','nagad'].includes(old.method)||!old.trxId||!old.owner)fail(409,'Payment receipt তথ্য অসম্পূর্ণ।');
       const receipt=db.collection('manualPaymentReceipts').doc(digestString(old.method+':'+old.trxId)),user=db.collection('users').doc(docId(old.owner)),[used,saved]=await Promise.all([tx.get(receipt),tx.get(user)]);
       if(used.exists)fail(409,'এই receipt আগে ব্যবহার হয়েছে।');const credits=number(saved.data()?.credits,Number.MAX_SAFE_INTEGER,true),gain=number(old.totalCredits,1000000,true);if(!gain||!Number.isSafeInteger(credits+gain))fail(409,'ক্রেডিটের তথ্য সঠিক নয়।');
       set(user,{credits:credits+gain});create(receipt,{orderId:b.documentId,created:now});create(db.collection('records').doc('manual-payment-'+b.documentId),{owner:old.owner,kind:'credit-purchase',title:'ম্যানুয়াল পেমেন্টে ক্রেডিট ক্রয়',created:now,data:JSON.stringify({amount:old.priceBDT,credits:gain,orderId:b.documentId,method:old.method,trxId:old.trxId})});result.verificationReference=verificationReference;
      }
      set(target,{status,reason,reviewedBy:'personal-agent',reviewedAt:now,...(result.verificationReference?{verificationReference:result.verificationReference}:{})});
     }
    }else if(b.action==='credits.adjust'){
     const credits=number(patch.credits,100000,true),before=number(old.credits,100000,true),reason=text(patch.reason,300,5);if(before===credits)fail(400,'ক্রেডিট আগের মতোই আছে।');set(target,{credits});
     const entry={actor:'personal-agent',userId:b.documentId,email:old.email||'',before,after:credits,reason,created:now};create(db.collection('adminAudit').doc('agent-'+b.operationId),entry);create(db.collection('records').doc('admin-credit-agent-'+b.operationId),{owner:b.documentId,kind:'credit-log',title:'এজেন্টের ক্রেডিট সমন্বয়',created:now,data:JSON.stringify(entry)});
    }else fail(400,'এই পরিবর্তন নেই।');
   }else{
    if(b.action==='products.update'){
     const allowed=['name','category','unit','price','salePrice','stock','description','costPrice','extraCost','profitPercent','cod','isFlash','isFeatured','status','imageUrl'];exact(patch.data,allowed);if(!Object.keys(patch.data).length)fail(400,'Product fields দিন।');
     for(const [key,value] of Object.entries(patch.data)){
      if(['name','category','unit'].includes(key))text(value,key==='name'?180:80);else if(key==='description')text(value,10000,0);
      else if(['cod','isFlash','isFeatured'].includes(key)){if(typeof value!=='boolean')fail(400,'Boolean field সঠিক নয়।');}
      else if(key==='status')choice(value,['active','inactive']);else if(key==='imageUrl')https(value);else number(value,1e8,key==='stock');
     }
     const next={...old,...patch.data};if(typeof next.salePrice!=='number'||next.salePrice<=0||typeof next.price!=='number'||next.price<next.salePrice)fail(400,'Price অবশ্যই salePrice-এর সমান বা বেশি এবং salePrice শূন্যের বেশি হবে।');
     if(patch.data.stock!==undefined){number(old.stock,1e8,true);create(db.collection('stock_logs').doc('agent-'+b.operationId),{productId:b.documentId,type:'agent_adjustment',before:old.stock,after:patch.data.stock,quantity:patch.data.stock-old.stock,createdAt:now,actor:'personal-agent'});}
     set(target,{...patch.data,updatedAt:now});
    }else if(b.action==='store.update'){
     exact(patch.data,['storeAnnouncement','storeHours','deliveryMin','deliveryMax','expressCharge']);if(!Object.keys(patch.data).length)fail(400,'Store fields দিন।');
     for(const[k,v]of Object.entries(patch.data)){text(v,k==='storeAnnouncement'?1000:150,0);if(['deliveryMin','deliveryMax','expressCharge'].includes(k)&&v&&!/^\d+(\.\d{1,2})?$/.test(v))fail(400,'Store numeric settings-এ digit string দিন।');}set(target,{...patch.data,updatedAt:now});
    }else if(b.action==='orders.note'){set(target,{adminNote:text(patch.note,2000,0),noteUpdatedAt:now});
    }else if(b.action==='orders.assign'){
     if(!['confirmed','packed','assigned'].includes(old.status))fail(409,'এই অবস্থায় driver assign করা যায় না।');
     const selected=docId(patch.driverId),staffDirect=await tx.get(db.collection('staff').doc(selected)),driverDirect=await tx.get(db.collection('drivers').doc(selected));let staff=staffDirect,driver=driverDirect;
     if(!staff.exists){
      if(!driver.exists||typeof driver.data().phone!=='string')fail(409,'Driver-এর active staff account খুঁজে পাওয়া যায়নি।');
      const matches=await tx.get(db.collection('staff').where('phone','==',driver.data().phone).limit(10)),active=matches.docs.filter(d=>activeDriver(d.data()));
      if(matches.size===10||active.length!==1)fail(409,'Driver phone-এর staff UID অস্পষ্ট; account link ঠিক করুন।');staff=active[0];
     }
     if(!driver.exists){
      if(typeof staff.data().phone!=='string')fail(409,'Legacy driver directory link পাওয়া যায়নি।');const matches=await tx.get(db.collection('drivers').where('phone','==',staff.data().phone).limit(3)),active=matches.docs.filter(d=>d.data().active!==false);
      if(matches.size===3||active.length!==1)fail(409,'Driver directory-তে একক phone link প্রয়োজন।');driver=active[0];
     }
     if(driver.data().active===false||!activeDriver(staff.data())||driver.id!==staff.id&&driver.data().phone!==staff.data().phone)fail(409,'Driver directory ও active staff account মেলেনি।');
     const driverZone=staff.data().branchZone||driver.data().branchZone;if(old.branchZone&&driverZone&&old.branchZone!==driverZone)fail(409,'ড্রাইভার ও অর্ডারের branchZone মেলেনি।');
     set(target,{driverId:staff.id,driverName:driver.data().name||staff.data().name||'',status:'assigned',driverAccepted:false,assignedAt:now,updatedAt:now});result.assignedDriverUid=staff.id;result.driverDirectoryId=driver.id;
    }else if(b.action==='orders.transition'){
     const status=choice(patch.status,['confirmed','packed','picked_up','in_transit','delivered']),reason=text(patch.reason,300,5),next={pending:['confirmed'],confirmed:['packed'],assigned:['packed'],packed:['picked_up'],picked_up:['in_transit'],in_transit:['delivered']};
     if(!next[old.status]?.includes(status))fail(409,'অর্ডারের এই ধাপ থেকে সরাসরি সেখানে যাওয়া যায় না।');
     if(['picked_up','in_transit','delivered'].includes(status)||old.status==='assigned'){
      if(!old.driverId||old.driverAccepted!==true)fail(409,'অর্ডারের active assigned driver-এর acceptance প্রয়োজন।');const staff=await tx.get(db.collection('staff').doc(docId(old.driverId)));if(!activeDriver(staff.data()))fail(409,'Assigned driver এখন সক্রিয় নয়।');
     }
     const stamp={picked_up:'pickedUpAt',in_transit:'startedDeliveryAt',delivered:'deliveredAt'}[status];set(target,{status,updatedAt:now,agentStatusReason:reason,...(stamp?{[stamp]:now}:{})});
    }else if(b.action==='orders.cancel'){
     text(patch.reason,500,5);if(!['pending','confirmed','packed','assigned'].includes(old.status))fail(409,'এই অর্ডার বাতিল বা refund করা যাবে না।');
     const wallet=old.walletUsed===undefined?0:number(old.walletUsed,1e8),user=wallet&&old.userId?db.collection('users').doc(docId(old.userId)):null,savedUser=user?await tx.get(user):null;
     if(wallet&&!user)fail(409,'Wallet refund customer missing।');
     let coupon=null,couponData=null;if(old.couponCode){const rows=await tx.get(db.collection('coupons').where('code','==',old.couponCode).limit(2));if(rows.size!==1)fail(409,'Coupon record অস্পষ্ট; manual review প্রয়োজন।');coupon=rows.docs[0].ref;couponData=rows.docs[0].data();number(couponData.usedCount??0,1e8,true);}
     const quantities=new Map();if(old.orderType!=='custom-bazar'){
      if(!Array.isArray(old.items)||old.items.length<1||old.items.length>100)fail(409,'Order item data সঠিক নয়।');for(const item of old.items){docId(item.productId);number(item.qty,100000,true);if(item.qty<1)fail(409,'Item quantity সঠিক নয়।');quantities.set(item.productId,(quantities.get(item.productId)||0)+item.qty);}
     }
     const products=[];for(const[id,qty]of quantities){const product=db.collection('products').doc(id),s=await tx.get(product);if(!s.exists)fail(409,'Refund-এর product নেই; manual review প্রয়োজন।');const p=s.data();number(p.stock,1e8,true);number(p.sold??0,1e8,true);number(p.stock+qty,1e8,true);products.push({product,data:{stock:p.stock+qty,sold:Math.max(0,(p.sold||0)-qty)}});}
     if(user){if(!savedUser.exists)fail(409,'Wallet customer record নেই।');const balance=number(savedUser.data().walletBalance??0,1e8);number(balance+wallet,1e8);set(user,{walletBalance:balance+wallet});}
     if(coupon)set(coupon,{usedCount:Math.max(0,(couponData.usedCount||0)-1)});for(const p of products)set(p.product,p.data);
     set(target,{status:'cancelled',paymentStatus:'cancelled',cancelReason:patch.reason,cancelledAt:now});result.walletRefunded=wallet;result.externalRefundProcessed=false;result.manualRefundRequired=old.orderType==='custom-bazar'||['verified','paid_pending_verification'].includes(old.paymentStatus);result.stockRestored=products.map(p=>p.product.id);
    }else if(b.action==='payments.review'){
     const decision=choice(patch.decision,['verified','mismatch']),reason=text(patch.reason,300,5);
     if(old.orderType==='custom-bazar'||old.paymentStatus!=='paid_pending_verification'||!['pending','confirmed','packed','assigned'].includes(old.status))fail(409,'এই payment সাধারণ verification-এর উপযুক্ত নয়।');
     if(decision==='verified'){
      const verificationReference=text(patch.verificationReference,300,8);if(!['bkash','nagad'].includes(old.paymentMethod)||typeof old.paymentTrxId!=='string'||!/^[A-Z0-9]{8,64}$/.test(old.paymentTrxId))fail(409,'Payment receipt সঠিক নয়।');
      const claim=db.collection('payment_claims').doc(digestString('agent-receipt:'+old.paymentMethod+':'+old.paymentTrxId)),taken=await tx.get(claim),duplicates=await tx.get(db.collection('orders').where('paymentTrxId','==',old.paymentTrxId).limit(2));
      if(taken.exists||duplicates.docs.some(d=>d.id!==b.documentId))fail(409,'এই transaction ID অন্য অর্ডারে ব্যবহৃত।');
      create(claim,{orderId:b.documentId,method:old.paymentMethod,purpose:'agent-verification',createdAt:now});set(target,{paymentStatus:'verified',paymentVerifiedAt:now,paymentVerificationReference:verificationReference,paymentVerificationReason:reason,...(old.status==='pending'?{status:'confirmed'}:{})});
     }else set(target,{paymentStatus:'mismatch',paymentMismatchReason:reason});
    }else if(b.action==='tickets.update'){
     data={updatedAt:now};if(patch.status!==undefined){data.status=choice(patch.status,['open','in_progress','resolved','escalated']);if(data.status==='resolved')data.resolvedAt=now;}if(patch.priority!==undefined)data.priority=choice(patch.priority,['low','medium','high','urgent']);if(Object.keys(data).length===1)fail(400,'Ticket status/priority দিন।');set(target,data);
    }else fail(400,'এই পরিবর্তন নেই।');
   }
   return{result,commit:()=>{for(const write of writes)write();}};
  });
 }
 return{async execute(b){const info=actionInfo(site,b.action);if(!info)fail(400,'এই সাইটে action নেই। আগে capabilities পড়ুন।');if(!info.write)return read(b);if(env.AGENT_BRIDGE_ALLOW_WRITES!=='true')fail(403,'Target site-এ agent writes বন্ধ আছে।');if(info.financial&&env.AGENT_BRIDGE_FINANCIAL_WRITES!=='true')fail(403,'Target site-এ financial actions বন্ধ আছে।');if(!object(b.patch))fail(400,'Typed patch প্রয়োজন।');return mutate(b);}};
}
import {createHash} from 'node:crypto';
function digestString(value){return createHash('sha256').update(value).digest('hex');}
function activeDriver(staff){return staff?.role==='driver'&&staff.active!==false&&!['inactive','suspended','resigned'].includes(staff.status);}
