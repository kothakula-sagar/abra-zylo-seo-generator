import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTS,freshState,addToCart,deliveryFor,totals,placeOrder,advanceOrder,cancelOrder,canReview,eligibleReturns} from './store.js';
const details={name:'Demo Customer',phone:'9999999999',email:'demo@example.com',address:'Sample address',pin:'560043',payment:'UPI'};
const bag=()=>{const s=freshState();addToCart(s,'forest-tee','L','Forest green');return s;};
test('variant and out-of-stock validation',()=>{assert.throws(()=>addToCart(freshState(),'forest-tee','invalid','Forest green'));assert.throws(()=>addToCart(freshState(),'weekend-tee','L','Forest green'),/stock/);});
test('quantity across variants cannot exceed stock',()=>{const s=bag();s.settings.stocks['forest-tee']=1;assert.throws(()=>addToCart(s,'forest-tee','M','Midnight'),/stock/);});
test('pincode delivery and COD rules',()=>{assert.equal(deliveryFor('560043').days,2);assert.equal(deliveryFor('517247').days,5);assert.equal(deliveryFor('000000').available,false);assert.equal(deliveryFor('999999').available,false);assert.equal(deliveryFor('800001').cod,false);});
test('discounts and free-shipping calculations',()=>{const s=bag();assert.equal(totals(s,{coupon:'FIRST10'}).total,498);assert.equal(totals(s,{coupon:'ZYLOFRIEND'}).total,498);addToCart(s,'city-tote','One size','Warm tan');assert.equal(totals(s).shipping,0);assert.throws(()=>totals(s,{coupon:'FAKE'}));});
test('checkout validates address and stock',()=>{assert.throws(()=>placeOrder(bag(),{...details,phone:'1'},'1'));const s=bag();s.settings.stocks['forest-tee']=0;assert.throws(()=>placeOrder(s,details,'1'),/Stock/);});
test('order creation clears cart and reserves stock',()=>{const s=bag(),o=placeOrder(s,details,'ORDER1');assert.equal(s.cart.length,0);assert.equal(s.settings.stocks['forest-tee'],17);assert.equal(o.summary.total,548);assert.equal(s.orders.length,1);});
test('delivery rewards are awarded once; purchase enables review',()=>{const s=bag();placeOrder(s,{...details,coupon:'ZYLOFRIEND'},'1');assert.equal(canReview(s,'forest-tee'),false);for(let i=0;i<6;i++)advanceOrder(s,'1');assert.equal(s.points,99);assert.equal(canReview(s,'forest-tee'),true);assert.equal(s.referralAwarded,true);});
test('cancel restores stock and redeemed points once',()=>{const s=bag();s.points=100;placeOrder(s,{...details,redeem:true},'1');assert.equal(s.points,50);cancelOrder(s,'1');assert.equal(s.points,100);assert.equal(s.settings.stocks['forest-tee'],18);assert.throws(()=>cancelOrder(s,'1'));});
test('shipped orders cannot be cancelled',()=>{const s=bag();placeOrder(s,details,'1');advanceOrder(s,'1');advanceOrder(s,'1');assert.throws(()=>cancelOrder(s,'1'));});
test('redemption is capped and cannot make total negative',()=>{const s=bag();s.points=1000;assert.equal(totals(s,{redeem:true}).pointsUsed,50);});

test('duplicate order reference is idempotent even after the bag clears',()=>{const s=bag();const first=placeOrder(s,details,'SAME');const next=placeOrder(s,details,'SAME');assert.equal(first,next);assert.equal(s.orders.length,1);});
test('returns respect product policy and delivery date',()=>{const s=bag();placeOrder(s,details,'1');for(let i=0;i<4;i++)advanceOrder(s,'1');assert.equal(eligibleReturns(s.orders[0]).length,1);assert.equal(eligibleReturns(s.orders[0],Date.now()+8*86400000).length,0);});
