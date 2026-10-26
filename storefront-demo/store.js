export const PRODUCTS=[
 {id:'forest-tee',name:'The Everyday Cotton Tee',category:'Fashion',brand:'Zylo Studio',price:499,mrp:799,image:'tee',tag:'THE EVERYDAY EDIT',subtitle:'An easy fit. A good day.',sizes:['S','M','L','XL','XXL'],colours:['Forest green','Midnight'],stock:18,material:'Cotton',rating:4.8,description:'A comfortable crewneck with a relaxed silhouette. An effortless foundation for work-from-home days, slow weekends and everything in between.',details:['Cotton fabric · sample specification','Regular fit with a classic crew neckline','Machine wash cold with similar colours'],returnDays:7},
 {id:'daily-care',name:'Botanical Daily Care Set',category:'Beauty',brand:'Zylo Botanics',price:649,mrp:899,image:'care',tag:'A MOMENT FOR YOU',subtitle:'Your daily pause, bottled.',sizes:['One size'],colours:['Original'],stock:12,material:'Sample skincare set',rating:4.7,description:'A considered addition to your daily care shelf. This illustrative two-piece set pairs simple packaging with an easy everyday routine. Ingredients and suitability would be confirmed on a real listing.',details:['Two-piece concept set','Sample packaging, not a real cosmetic formulation','Check final ingredients before use'],returnDays:0},
 {id:'city-tote',name:'The City Carry Tote',category:'Accessories',brand:'Zylo Studio',price:1299,mrp:1799,image:'tote',tag:'MADE FOR YOUR EVERYDAY',subtitle:'Take a little more with you.',sizes:['One size'],colours:['Warm tan'],stock:8,material:'Leather-look finish',rating:4.9,description:'For the days that call for a little extra room. A structured silhouette, warm tan finish and comfortable handles make this concept tote a versatile everyday companion.',details:['Leather-look finish · sample specification','Spacious open compartment','Wipe clean with a soft damp cloth'],returnDays:7},
 {id:'ivory-shirt',name:'The Everyday Ivory Shirt',category:'Fashion',brand:'Zylo Studio',price:899,mrp:1299,image:'shirt',tag:'LESS, BUT BETTER',subtitle:'A softer side of everyday.',sizes:['XS','S','M','L','XL'],colours:['Ivory'],stock:14,material:'Cotton-blend concept',rating:4.8,description:'A softly structured shirt with a relaxed, versatile shape. Wear it tucked, layered or loose for an understated everyday look.',details:['Cotton-blend concept fabric','Relaxed shape with button front','Follow the final garment care label'],returnDays:7},
 {id:'weekend-tee',name:'The Weekend Tee',category:'Fashion',brand:'Zylo Studio',price:549,mrp:799,image:'tee',tag:'BACK SOON',subtitle:'Comfort worth coming back for.',sizes:['S','M','L','XL'],colours:['Forest green'],stock:0,material:'Cotton',rating:4.6,description:'The relaxed everyday tee, ready for your weekend rotation. This sample listing is out of stock so you can try the back-in-stock alert workflow.',details:['Relaxed fit · sample product','Cotton fabric · sample specification','Image reused for this concept variant'],returnDays:7},
 {id:'care-duo',name:'The Everyday Care Duo',category:'Beauty',brand:'Zylo Botanics',price:799,mrp:1099,image:'care',tag:'THE GIFT EDIT',subtitle:'A thoughtful little ritual.',sizes:['One size'],colours:['Original'],stock:6,material:'Sample care set',rating:4.7,description:'A giftable care concept for a simple, considered routine. The sample photo is shared with our Daily Care Set; real products would have their own accurate photography and specifications.',details:['Gift-ready concept collection','Sample packaging; no medical or cosmetic claims','Final ingredients and volumes to be supplied'],returnDays:0}
];
export const ORDER_STEPS=['Confirmed','Packed','Shipped','Out for delivery','Delivered'];
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export function freshState(){return {cart:[],wishlist:[],alerts:[],orders:[],reviews:[],tickets:[],returns:[],points:0,referralAwarded:false,language:'en',settings:{banner:'A little something for every day.',stocks:{}}};}
export function stockOf(product,state){return Number(state.settings.stocks[product.id]??product.stock);}
export function cartKey(id,size,colour){return [id,size,colour].join('|');}
export function addToCart(state,id,size,colour,qty=1){
 const p=PRODUCTS.find(p=>p.id===id);if(!p||!p.sizes.includes(size)||!p.colours.includes(colour))throw Error('Choose an available size and colour.');
 if(!Number.isInteger(qty)||qty<1)throw Error('Choose a valid quantity.');
 const total=state.cart.filter(x=>x.id===id).reduce((n,x)=>n+x.qty,0);
 if(total+qty>stockOf(p,state))throw Error('Not enough stock for this quantity.');
 const key=cartKey(id,size,colour),row=state.cart.find(x=>x.key===key);if(row)row.qty+=qty;else state.cart.push({key,id,size,colour,qty});
 return state;
}
export function deliveryFor(pin){
 if(!/^[1-9][0-9]{5}$/.test(pin))return {available:false,message:'Enter a valid 6-digit Indian pincode.'};
 if(pin.startsWith('999'))return {available:false,message:'This demo zone is not serviceable. Try 560043 or 517247.'};
 const days=pin.startsWith('560')?2:pin.startsWith('600')?3:5;
 return {available:true,days,cod:!pin.startsWith('8'),message:`Demo delivery in ${days} business days`};
}
export function totals(state,{coupon='',redeem=false}={}){
 const subtotal=state.cart.reduce((n,row)=>n+(PRODUCTS.find(p=>p.id===row.id)?.price||0)*row.qty,0);
 const normalized=coupon.trim().toUpperCase();let discount=0,referral=false;
 if(normalized==='FIRST10'&&!state.orders.length)discount=Math.min(Math.round(subtotal*.1),200);
 else if(normalized==='ZYLOFRIEND'&&!state.referralAwarded){discount=Math.min(50,subtotal);referral=true;}
 else if(normalized)throw Error('This code is invalid or has already been used. Try FIRST10 on your first demo order.');
 const shipping=subtotal===0||subtotal>=999?0:49;
 const pointsUsed=redeem?Math.min(50,state.points,Math.max(0,subtotal-discount)):0;
 return {subtotal,discount,shipping,pointsUsed,total:subtotal-discount+shipping-pointsUsed,referral};
}
export function placeOrder(state,{name,phone,email,address,pin,payment,coupon='',redeem=false},id){
 if(state.orders.some(x=>x.id===id))return state.orders.find(x=>x.id===id);
 if(!state.cart.length)throw Error('Your bag is empty.');
 const delivery=deliveryFor(pin);if(!delivery.available)throw Error(delivery.message);
 if(!name?.trim()||!address?.trim()||!/^\d{10}$/.test(phone||'')||!/^\S+@\S+\.\S+$/.test(email||''))throw Error('Complete the name, mobile, email and delivery address.');
 if(!['UPI','Card','COD'].includes(payment)||payment==='COD'&&!delivery.cod)throw Error('Choose an available payment method.');
 for(const row of state.cart){const p=PRODUCTS.find(p=>p.id===row.id);const qty=state.cart.filter(x=>x.id===row.id).reduce((n,x)=>n+x.qty,0);if(!p||qty>stockOf(p,state))throw Error('Stock changed. Please review your bag.');}
 const summary=totals(state,{coupon,redeem});
 const order={id,createdAt:new Date().toISOString(),items:structuredClone(state.cart),name:name.trim(),phone,email,address:address.trim(),pin,payment,summary,step:0,rewarded:false,cancelled:false,deliveryDays:delivery.days};
 for(const row of state.cart){const p=PRODUCTS.find(p=>p.id===row.id);state.settings.stocks[p.id]=stockOf(p,state)-row.qty;}
 state.points-=summary.pointsUsed;state.orders.unshift(order);state.cart=[];return order;
}
export function advanceOrder(state,id){
 const o=state.orders.find(x=>x.id===id);if(!o||o.cancelled)throw Error('This order cannot be advanced.');
 o.step=Math.min(4,o.step+1);
 if(o.step===4&&!o.rewarded){o.deliveredAt=new Date().toISOString();state.points+=Math.floor(o.summary.total/10)+(o.summary.referral?50:0);o.rewarded=true;if(o.summary.referral)state.referralAwarded=true;}
 return o;
}
export function cancelOrder(state,id){const o=state.orders.find(x=>x.id===id);if(!o||o.step>1||o.cancelled)throw Error('Cancellation is available before shipping.');o.cancelled=true;state.points+=o.summary.pointsUsed;for(const row of o.items){const p=PRODUCTS.find(p=>p.id===row.id);state.settings.stocks[p.id]=stockOf(p,state)+row.qty;}return o;}
export function canReview(state,id){return state.orders.some(o=>!o.cancelled&&o.step===4&&o.items.some(x=>x.id===id));}

export function eligibleReturns(order,now=Date.now()){if(!order||order.cancelled||order.step!==4||!order.deliveredAt)return [];return order.items.filter(row=>{const p=PRODUCTS.find(x=>x.id===row.id);return p?.returnDays>0&&now-new Date(order.deliveredAt).getTime()<=p.returnDays*86400000;});}
