import {randomUUID} from 'node:crypto';
import {problem,validateWorkflow,workflowHash,starterWorkflow} from './workflow-schema.mjs';

export function createMarketplace({store,payments=null,origin='http://127.0.0.1:4173'}){
  const own=(id,user)=>{const d=store.get('draft',id);if(!d||d.owner!==user.id)throw problem('Workflow draft not found.',404);return d;};
  function save(user,input){const workflow=validateWorkflow(input.workflow),id=input.id||randomUUID(),old=store.get('draft',id);if(old&&old.owner!==user.id)throw problem('Workflow not found.',404);if(old&&old.revision!==input.revision)throw problem('This draft changed elsewhere. Reload before saving.',409);
    return store.put('draft',{id,owner:user.id,creator:user.name,workflow,revision:(old?.revision||0)+1,status:'draft',createdAt:old?.createdAt||new Date().toISOString()});}
  function submit(user,id){const draft=own(id,user),packageId=id+'@'+draft.workflow.version;if(store.get('package',packageId))throw problem('This version already exists. Increment the version before publishing changes.',409);draft.status='submitted';return store.put('draft',draft);}
  function publish(user,id,{decision='approve',note=''}={}){if(!user.admin)throw problem('Marketplace administrator access is required.',403);const d=store.get('draft',id);if(!d||d.status!=='submitted')throw problem('No submitted draft to review.',409);
    if(!['approve','reject'].includes(decision))throw problem('Choose approve or reject.');
    return store.transaction(()=>{if(decision==='reject'){d.status='rejected';d.reviewNote=String(note).slice(0,1000);return store.put('draft',d);}const workflow=validateWorkflow(d.workflow),pkg={id:d.id+'@'+workflow.version,listingId:d.id,owner:d.owner,creator:d.creator,workflow,hash:workflowHash(workflow),publishedAt:new Date().toISOString(),status:'published'};
      if(store.get('package',pkg.id))throw problem('A published version is immutable. Publish a new version.',409);store.put('package',pkg);store.put('listing',{id:d.id,owner:d.owner,latest:pkg.id,status:'published'});d.status='published';store.put('draft',d);return pkg;});}
  function install(user,packageId){const pkg=store.get('package',packageId);if(!pkg||pkg.status!=='published')throw problem('Published workflow not found.',404);if(pkg.workflow.priceCents>0&&pkg.owner!==user.id)throw problem('Complete verified checkout before installing a paid workflow.',402);return store.put('entitlement',{id:user.id+':'+pkg.id,owner:user.id,packageId:pkg.id,kind:pkg.owner===user.id?'creator':'free',revoked:false,createdAt:new Date().toISOString()});}
  function catalog(user){return store.list('listing').filter(l=>l.status==='published').map(l=>store.get('package',l.latest)).filter(Boolean).map(p=>{const grant=store.get('entitlement',user.id+':'+p.id),installed=p.owner===user.id||!!grant&&!grant.revoked;return {...p,workflow:installed||!p.workflow.priceCents?p.workflow:{...p.workflow,steps:p.workflow.steps.map(({id,type,label})=>({id,type,label}))},installed};});}
  async function checkout(user,packageId){
    const pkg=store.get('package',packageId);if(!pkg||pkg.status!=='published')throw problem('Published workflow not found.',404);
    if(!pkg.workflow.priceCents||pkg.owner===user.id)return {installed:install(user,packageId)};
    if(!payments)throw problem('Paid checkout is not configured. Set the marketplace Stripe keys and webhook before accepting payments.',503);
    const creator=store.get('user',pkg.owner);if(!creator?.stripeAccount)throw problem('This creator has not connected a payout account.',409);
    const account=await payments.accounts.retrieve(creator.stripeAccount);if(!account.charges_enabled||!account.payouts_enabled)throw problem('The creator must finish Stripe onboarding before accepting payments.',409);
    const order=store.put('order',{id:randomUUID(),owner:user.id,packageId,amount:pkg.workflow.priceCents,currency:'usd',status:'pending',createdAt:new Date().toISOString()});
    try{const session=await payments.checkout.sessions.create({mode:'payment',client_reference_id:order.id,customer_email:user.email,line_items:[{price_data:{currency:'usd',unit_amount:order.amount,product_data:{name:pkg.workflow.title+' v'+pkg.workflow.version}},quantity:1}],metadata:{orderId:order.id},payment_intent_data:{transfer_data:{destination:creator.stripeAccount}},success_url:origin+'/?checkout=success#marketplace',cancel_url:origin+'/?checkout=cancel#marketplace'},{idempotencyKey:'hyper-order-'+order.id});order.sessionId=session.id;store.put('order',order);return {url:session.url,orderId:order.id};}catch(error){order.status='checkout_error';store.put('order',order);throw problem('Checkout could not be started. Inspect the order before retrying.',502);}
  }
  function webhook(event){
    if(store.get('payment-event',event.id))return {received:true,duplicate:true};
    return store.transaction(()=>{
      const object=event.data?.object;
      if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
        const order=store.get('order',object?.client_reference_id);if(!order)throw problem('Unknown marketplace order.',400);
        if(order.sessionId!==object.id||object.amount_total!==order.amount||object.currency!==order.currency||object.metadata?.orderId!==order.id)throw problem('Payment does not match its order.',400);
        if(object.payment_status==='paid'){
          if(store.get('revoked-payment',object.payment_intent)){order.status='refunded';order.paymentIntent=object.payment_intent;store.put('order',order);}
          if(order.status!=='refunded'){order.status='paid';order.paymentIntent=object.payment_intent;store.put('order',order);store.put('entitlement',{id:order.owner+':'+order.packageId,owner:order.owner,packageId:order.packageId,kind:'paid',orderId:order.id,revoked:false,createdAt:new Date().toISOString()});}
        }
      }
      if(['charge.refunded','charge.dispute.created'].includes(event.type)){
        if(object?.payment_intent&&(event.type==='charge.dispute.created'||object.refunded))store.put('revoked-payment',{id:object.payment_intent,owner:'',type:event.type});
        const intent=object?.payment_intent;for(const order of store.list('order').filter(o=>o.paymentIntent===intent&&intent)){
          if(event.type==='charge.refunded'&&!object.refunded)continue;order.status='refunded';store.put('order',order);const entitlement=store.get('entitlement',order.owner+':'+order.packageId);if(entitlement?.orderId===order.id){entitlement.revoked=true;store.put('entitlement',entitlement);}
        }
      }
      store.put('payment-event',{id:event.id,owner:'',type:event.type});return {received:true};
    });
  }
  async function onboard(user){if(!payments)throw problem('Stripe Connect is not configured.',503);const saved=store.get('user',user.id);if(!saved.stripeAccount){const account=await payments.accounts.create({type:'express',email:user.email,capabilities:{card_payments:{requested:true},transfers:{requested:true}}},{idempotencyKey:'hyper-creator-'+user.id});saved.stripeAccount=account.id;store.put('user',saved);}const link=await payments.accountLinks.create({account:saved.stripeAccount,type:'account_onboarding',refresh_url:origin+'/#creators',return_url:origin+'/#creators'});return {url:link.url};}
  function seed(){if(store.get('listing','starter-review'))return;const admin=store.list('user').find(u=>u.admin);if(!admin)return;const draft={id:'starter-review',owner:admin.id,creator:'HyperAccts',workflow:starterWorkflow(),revision:1,status:'submitted',createdAt:new Date().toISOString()};store.put('draft',draft);publish(admin,draft.id);}
  return {save,submit,publish,install,catalog,checkout,webhook,onboard,seed};
}
