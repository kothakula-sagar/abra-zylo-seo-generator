import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { cleanFacts, factsPrompt, findDuplicates, toChecklist, fromRecord, approvalErrors, contentDiff } from '../js/seo-quality.js';
import { createSeoStore } from '../js/seo-store.js';
import { computeSeoScore } from '../js/utils.js';

const result = () => ({productId:'p1',productName:'Green Tee',category:'Fashion',lang:'en',meta_title:'Green Cotton Tee',meta_description:'A green cotton tee. Shop Abra Zylo.',seo_slug:'green-cotton-tee',alt_text:'Green crewneck tee, front view',short_description:'An everyday green tee.',product_description:'This green cotton tee has a crew neckline. Check the size guide before choosing your fit.',focus_keywords:['green tee'],product_tags:['tee'],socialMedia:{instagram:'Shop this tee.'},verifiedFacts:{material:'Cotton',source:'Supplier catalogue 24',confirmed:true}});
function fakeFirebase() {
  const docs = new Map([['products/p1',{productName:'Green Tee'}]]);
  let id=0; let deny=false;
  const snap = key => ({id:key.split('/').at(-1),exists:()=>docs.has(key),data:()=>structuredClone(docs.get(key))});
  const FB={
    docRef:(col,id)=>`${col}/${id}`,newDocRef:col=>({id:`archive${++id}`,toString(){return `${col}/${this.id}`;}}),
    col:name=>name,serverTimestamp:()=>Date.now(),
    getDoc:async key=>{if(deny)throw Error('permission denied');return snap(String(key));},
    getDocs:async col=>{if(deny)throw Error('permission denied');return {docs:[...docs.keys()].filter(k=>k.startsWith(col+'/')).map(snap)};},
    runTransaction:async callback=>{
      if(deny)throw Error('permission denied');
      const pending=[];
      const value=await callback({get:async key=>snap(String(key)),set:(key,v)=>pending.push([String(key),structuredClone(v)]),update:(key,v)=>{if(!docs.has(String(key)))throw Error('missing product');pending.push([String(key),{...docs.get(String(key)),...structuredClone(v)}]);}});
      pending.forEach(([k,v])=>docs.set(k,v));return value;
    }
  };
  return {FB,docs,setDeny:value=>{deny=value;}};
}
test('alt text, summary, social text and facts survive a storage round trip',()=>{
  const r=result();const saved={productId:r.productId,language:'en',seoChecklist:toChecklist(r),verifiedFacts:r.verifiedFacts};
  const back=fromRecord(saved,{id:'p1',productName:'Green Tee'});
  for(const field of ['alt_text','short_description','socialMedia','verifiedFacts']) assert.deepEqual(back[field],field==='verifiedFacts'?cleanFacts(r[field]):field==='socialMedia'?toChecklist(r).socialMedia:r[field]);
});
test('legacy records without alt text remain readable without inventing it',()=>{assert.equal(fromRecord({seoChecklist:{metaTitle:'Old'}}).alt_text,'');});
test('unverified facts prompt forbids inferred specifications',()=>{const prompt=factsPrompt({material:'Cotton'});assert.match(prompt,/UNVERIFIED/);assert.match(prompt,/photo cannot prove/);});
test('verified source and specifications are required for approval',()=>{assert.equal(approvalErrors(result()).length,0);assert.ok(approvalErrors({...result(),verifiedFacts:{}}).length>=2);});
test('slug validation blocks malformed slugs',()=>assert.ok(approvalErrors({...result(),seo_slug:'Green Tee?'}).some(x=>x.includes('slug'))));
test('duplicate check catches slug across languages and case',()=>{
  const warnings=findDuplicates(result(),[{productId:'p2',language:'hi',seoChecklist:{seoSlug:'GREEN-COTTON-TEE'}}]);
  assert.equal(warnings[0].severity,'block');
});
test('duplicate title check supports Unicode and ignores own product / archives',()=>{
  const r={...result(),meta_title:'नीली सूती शर्ट'};
  const rows=[{productId:'p2',language:'en',seoChecklist:{metaTitle:r.meta_title}},{productId:'p1',seoChecklist:toChecklist(r)},{productId:'p3',isArchive:true,seoChecklist:toChecklist(r)}];
  assert.equal(findDuplicates(r,rows).length,1);
});
test('duplicate descriptions catch near copies but not unrelated products',()=>{
  const r=result();const rows=[{productId:'p2',seoChecklist:{productDescription:r.product_description+' Today.'}},{productId:'p3',seoChecklist:{productDescription:'A kitchen pan for cooking.'}}];
  assert.equal(findDuplicates(r,rows).length,1);
});
test('saving creates draft then archives previous content atomically',async()=>{
  const {FB,docs}=fakeFirebase();const store=createSeoStore(FB);const r=result();
  await store.save(r,{uid:'u',expectedRevision:0});
  r.alt_text='Back view';await store.save(r,{uid:'u',expectedRevision:1});
  const all=[...docs.values()].filter(x=>x.productId);
  assert.equal(all.length,2);assert.equal(all.find(x=>x.isArchive).seoChecklist.altText,'Green crewneck tee, front view');
  assert.equal((await store.read('p1','en')).seoChecklist.altText,'Back view');
  assert.equal((await store.read('p1','en')).workflowStatus,'draft');
});
test('stale revision cannot overwrite or archive current content',async()=>{
  const {FB,docs}=fakeFirebase();const store=createSeoStore(FB);
  await store.save(result(),{uid:'u',expectedRevision:0});const before=JSON.stringify([...docs]);
  await assert.rejects(store.save({...result(),alt_text:'Wrong'},{uid:'u',expectedRevision:0}),/Another session/);
  assert.equal(JSON.stringify([...docs]),before);
});
test('restored approved content must save as a new draft',async()=>{
  const {FB}=fakeFirebase();const store=createSeoStore(FB);const r=result();
  await store.save(r,{uid:'admin',status:'approved',expectedRevision:0,reviewer:'Admin'});
  const old=await store.read('p1','en');const restored=fromRecord(old);
  await store.save(restored,{uid:'u',status:'draft',expectedRevision:1});
  const current=await store.read('p1','en');assert.equal(current.workflowStatus,'draft');assert.equal(current.reviewedBy,'');assert.equal(current.revision,2);
});
test('failed transaction does not partially write history',async()=>{
  const {FB,docs,setDeny}=fakeFirebase();const store=createSeoStore(FB);setDeny(true);
  await assert.rejects(store.save(result(),{uid:'u',expectedRevision:0}),/permission/);assert.equal(docs.size,1);
});
test('legacy current record is preserved at revision zero before replacement',async()=>{
  const {FB,docs}=fakeFirebase();docs.set('SEO_History/seo_p1_en',{productId:'p1',language:'en',seoChecklist:{metaTitle:'Legacy'}});
  await createSeoStore(FB).save(result(),{uid:'u',expectedRevision:0});
  assert.ok([...docs.values()].some(x=>x.isArchive&&x.seoChecklist.metaTitle==='Legacy'));
});
test('short useful description does not fail a 200-word minimum',()=>{
  const score=computeSeoScore(result());assert.equal(score.checks.find(x=>x.label==='Product Description has useful text').pass,true);
  assert.equal(score.checks.find(x=>x.label==='Meta Title present and concise').pass,true);
});
test('content comparison identifies alt and summary changes',()=>{const r=result();assert.deepEqual(contentDiff(r,{...r,alt_text:'Back view',short_description:'New summary'}),['altText','shortDescription']);});

// Test actual generator wiring with DOM/service doubles. Never calls Firebase or AI.
async function generatorHarness(admin=true) {
  const f=fakeFirebase();const elements=new Map();const messages=[];const context=vm.createContext({console,setTimeout:()=>0,clearTimeout,Date,JSON,Blob,confirm:()=>true,document:{getElementById:id=>elements.get(id)||null},window:{}});
  const put=(id,value='')=>{const node={value,checked:false,textContent:'',innerHTML:'',style:{},querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}}};elements.set(id,node);return node;};
  for(const [key,value] of Object.entries(cleanFacts(result().verifiedFacts)))if(key!=='confirmed')put('fact-'+key,value);
  put('facts-confirmed').checked=true;put('autosave-banner');put('result-content');put('result-empty');put('prod-lang','en');put('duplicate-results');
  const noop=()=>{};
  const mocks={
    './firebase.js':{FB:f.FB},'./auth.js':{getUser:()=>({uid:'u',email:'test@example.com'}),getUserDoc:()=>({}),getApiKey:()=>'',isAccessRestricted:()=>false,getAccessMessage:()=>'',isAdmin:()=>admin},
    './ai.js':{callAI:()=>{throw Error('Live AI forbidden in tests');},friendlyError:e=>e.message,validateKey:()=>true},
    './cloudinary.js':{uploadImage:noop,getResponsive:noop,getThumbnail:noop,isFirebaseStorageUrl:()=>false},
    './product-model.js':{normalizeModelNumber:x=>x,checkModelNumberExists:async()=>null},
    './data-cache.js':{patchArrayItem:async()=>{},CACHE_KEYS:{products:'products'}},
    './ui.js':Object.fromEntries(['showAlert','hideAlert','showLoading','setLoadingProgress','completeStep','hideLoading','switchResultTab','animateScoreRing','copyText'].map(x=>[x,noop]).concat([['showToast',x=>messages.push(x)],['charPill',()=>'<span>length guide</span>']]))
  };
  const modules=new Map();
  async function load(spec){
    if(modules.has(spec))return modules.get(spec);
    if(mocks[spec]){const data=mocks[spec];const mod=new vm.SyntheticModule(Object.keys(data),function(){Object.entries(data).forEach(([k,v])=>this.setExport(k,v));},{context});modules.set(spec,mod);return mod;}
    let code=await readFile(new URL('../js/'+spec.replace('./',''),import.meta.url),'utf8');
    if(spec==='./seo-generator.js')code+='\nexport {_buildFullPrompt as testPrompt, _applyDeterministicFallback as testFallback};';
    const mod=new vm.SourceTextModule(code,{context,identifier:spec});modules.set(spec,mod);await mod.link(dep=>load(dep));return mod;
  }
  const mod=await load('./seo-generator.js');await mod.evaluate();return {...f,gen:mod.namespace,elements,put,messages};
}
test('generator draft save and restore include alt text and summary',async()=>{
  const h=await generatorHarness();h.gen.setCurrentResult(result());await h.gen.saveAnyway();
  const current=h.docs.get('SEO_History/seo_p1_en');assert.equal(current.seoChecklist.altText,result().alt_text);assert.equal(current.seoChecklist.shortDescription,result().short_description);
  await h.gen.restoreSeoRecord({...current,id:'old'},{id:'p1',productName:'Green Tee'});
  assert.equal(h.docs.get('SEO_History/seo_p1_en').workflowStatus,'draft');assert.match(h.elements.get('result-content').innerHTML,/Green crewneck tee/);
});
test('generator HTML escapes hostile model content, including OpenCart preview',async()=>{
  const h=await generatorHarness();const r={...result(),alt_text:'<img src=x onerror=alert(1)>',meta_title:'<script>bad</script>'};
  h.gen.renderResult(r,computeSeoScore(r));const html=h.elements.get('result-content').innerHTML;
  assert.ok(!html.includes('<script>bad'));assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;script&gt;/);
});
test('non-admin cannot approve and draft save stays available',async()=>{
  const h=await generatorHarness(false);h.gen.setCurrentResult(result());await h.gen.approveReview();
  assert.ok(h.messages.some(x=>x.includes('administrator')));assert.equal(h.docs.size,1);
  await h.gen.saveAnyway();assert.equal(h.docs.get('SEO_History/seo_p1_en').workflowStatus,'draft');
});
test('approval checks slug collision and fails closed on database error',async()=>{
  const h=await generatorHarness();h.docs.set('SEO_History/other',{productId:'p2',seoChecklist:{seoSlug:result().seo_slug}});h.gen.setCurrentResult(result());
  await h.gen.approveReview();assert.ok(h.messages.some(x=>x.includes('duplicate SEO slug')));
  h.setDeny(true);await assert.rejects(h.gen.checkDuplicates(false),/permission/);
  assert.match(h.elements.get('duplicate-results').textContent,/failed/);
});
test('full and section prompts forbid inferred materials; fallback never appends necklace copy',async()=>{
  const h=await generatorHarness();const prompt=h.gen.testPrompt('Green Tee','Fashion','en','Minimal');
  assert.match(prompt,/confirmed product facts/);assert.match(prompt,/supplier|Supplier/);
  assert.equal(h.gen.testFallback('product_description','A kitchen pan.',result()),'A kitchen pan.');
});
