/**
 * اختبارات منطق السلة والحسابات — تعمل بدون متصفح (Node built-in test runner).
 * التشغيل: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CART_STORAGE_KEY,
  MAX_QUANTITY,
  addItem,
  clampQuantity,
  clearCart,
  decrementItem,
  formatMoney,
  getItemCount,
  getQuantity,
  getTotals,
  incrementItem,
  normalizePhone,
  normalizeWhatsAppNumber,
  removeItem,
  sanitizeCart,
  setQuantity,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  validateCheckout,
} from "../../public/js/cart.js";
import { menu, categories } from "../../public/js/menu.js";
import { siteConfig } from "../../public/js/config.js";

const settings = {
  deliveryFee: siteConfig.deliveryFee,
  freeDeliveryMinimum: siteConfig.freeDeliveryMinimum,
  currency: siteConfig.currency,
};

const priceOf = (id) => menu.find((product) => product.id === id).price;

/* ───── بيانات المطعم ───── */

test("بيانات المطعم تجريبية ورقم واتساب غير مضبوط افتراضياً", () => {
  assert.equal(siteConfig.whatsappNumber, "", "يجب ألا يكون هناك رقم واتساب حقيقي افتراضي");
  assert.equal(buildWhatsAppUrl(siteConfig.whatsappNumber, "مرحبا"), "");
  assert.match(siteConfig.demoNotice, /تجريبي/);
  assert.equal(siteConfig.currency, "د.أ");
});

test("القائمة تحتوي على التصنيفات الثلاثة وأصناف كاملة البيانات", () => {
  assert.deepEqual(
    categories.map((category) => category.id),
    ["burgers", "sides", "drinks"]
  );
  assert.ok(menu.length >= 9, "قائمة الطعام يجب أن تحتوي على أصناف كافية");

  for (const product of menu) {
    assert.ok(product.id && typeof product.id === "string", "كل صنف يحتاج معرّفاً");
    assert.ok(product.name.length > 1, `الصنف ${product.id} يحتاج اسماً`);
    assert.ok(product.description.length > 10, `الصنف ${product.id} يحتاج وصفاً`);
    assert.ok(product.price > 0, `الصنف ${product.id} يحتاج سعراً موجباً`);
    assert.match(product.image, /^\/assets\/images\/.+\.webp$/, `صورة ${product.id} يجب أن تكون محلية`);
    assert.ok(
      categories.some((category) => category.id === product.category),
      `تصنيف ${product.id} غير معروف`
    );
  }

  assert.ok(
    menu.filter((product) => product.popular).length >= 3,
    "قسم الأكثر طلباً يحتاج 3 أصناف على الأقل"
  );
});

/* ───── عمليات السلة ───── */

test("إضافة منتج جديد ثم زيادته تُراكم الكمية", () => {
  let cart = { items: [] };
  cart = addItem(cart, "classic-burger");
  assert.equal(getQuantity(cart, "classic-burger"), 1);

  cart = addItem(cart, "classic-burger", 2);
  assert.equal(getQuantity(cart, "classic-burger"), 3);
  assert.equal(getItemCount(cart), 3);

  cart = addItem(cart, "cola");
  assert.equal(cart.items.length, 2);
  assert.equal(getItemCount(cart), 4);
});

test("الكمية محدودة بالحد الأعلى ولا تنزل تحت 1", () => {
  const cart = addItem({ items: [] }, "fries", 999);
  assert.equal(getQuantity(cart, "fries"), MAX_QUANTITY);
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(-5), 1);
  assert.equal(clampQuantity(3.9), 3);
  assert.equal(clampQuantity("abc"), 1);
});

test("النقصان يزيل الصنف عند الوصول إلى صفر، وremoveItem يحذف مباشرة", () => {
  let cart = addItem({ items: [] }, "onion-rings");
  cart = incrementItem(cart, "onion-rings");
  assert.equal(getQuantity(cart, "onion-rings"), 2);

  cart = decrementItem(cart, "onion-rings");
  assert.equal(getQuantity(cart, "onion-rings"), 1);

  cart = decrementItem(cart, "onion-rings");
  assert.equal(getQuantity(cart, "onion-rings"), 0);
  assert.equal(cart.items.length, 0);

  cart = addItem(cart, "cola");
  cart = removeItem(cart, "cola");
  assert.equal(cart.items.length, 0);
});

test("setQuantity و clearCart يعملان كما هو متوقع", () => {
  let cart = addItem({ items: [] }, "fries");
  cart = setQuantity(cart, "fries", 5);
  assert.equal(getQuantity(cart, "fries"), 5);

  cart = setQuantity(cart, "fries", 0);
  assert.equal(getQuantity(cart, "fries"), 0);

  cart = addItem({ items: [] }, "fries");
  cart = addItem(cart, "cola");
  assert.equal(getItemCount(clearCart(cart)), 0);
});

test("الدوال لا تعدّل السلة الأصلية", () => {
  const original = addItem({ items: [] }, "fries");
  const snapshot = JSON.stringify(original);
  addItem(original, "fries");
  incrementItem(original, "fries");
  removeItem(original, "fries");
  assert.equal(JSON.stringify(original), snapshot);
});

/* ───── الحسابات المالية ───── */

test("الإجمالي الفرعي ورسوم التوصيل والإجمالي تُحسب بدقة (بالدينار)", () => {
  const cart = { items: [{ id: "fries", qty: 2 }] }; // 2.00 × 2 = 4.00
  const totals = getTotals(cart, menu, settings);

  assert.equal(totals.subtotal, 4);
  assert.equal(totals.deliveryFee, siteConfig.deliveryFee);
  assert.equal(totals.total, 4 + siteConfig.deliveryFee);
  assert.equal(totals.lineTotal ?? totals.lines[0].lineTotal, 4);
  assert.equal(totals.freeDeliveryApplied, false);
  assert.equal(totals.freeDeliveryRemaining, siteConfig.freeDeliveryMinimum - 4);
});

test("الحساب لا يتأثر بأخطاء الفاصلة العائمة عند تراكم أسعار كسرية", () => {
  // 6.25 × 3 + 2.75 + 1.75 = 23.25
  const cart = {
    items: [
      { id: "double-cheese", qty: 3 },
      { id: "vanilla-shake", qty: 1 },
      { id: "mint-lemonade", qty: 1 },
    ],
  };
  const totals = getTotals(cart, menu, settings);
  assert.equal(totals.subtotal, 23.25);
  assert.equal(totals.itemCount, 5);
  assert.equal(formatMoney(totals.subtotal), "23.25 د.أ");
});

test("التوصيل مجاني عند الوصول للحد الأدنى، والسلة الفارغة بلا رسوم", () => {
  const minimum = siteConfig.freeDeliveryMinimum;
  const cart = { items: [{ id: "fries", qty: Math.ceil(minimum / priceOf("fries")) }] };
  const totals = getTotals(cart, menu, settings);

  assert.ok(totals.subtotal >= minimum);
  assert.equal(totals.freeDeliveryApplied, true);
  assert.equal(totals.deliveryFee, 0);
  assert.equal(totals.total, totals.subtotal);
  assert.equal(totals.freeDeliveryRemaining, 0);

  const empty = getTotals({ items: [] }, menu, settings);
  assert.deepEqual(
    { subtotal: empty.subtotal, deliveryFee: empty.deliveryFee, total: empty.total },
    { subtotal: 0, deliveryFee: 0, total: 0 }
  );
});

test("الأصناف غير الموجودة في القائمة تُتجاهل في الحساب", () => {
  const totals = getTotals({ items: [{ id: "ghost-item", qty: 2 }] }, menu, settings);
  assert.equal(totals.lines.length, 0);
  assert.equal(totals.total, 0);
});

test("sanitizeCart يتعامل مع بيانات localStorage التالفة", () => {
  assert.deepEqual(sanitizeCart(null, menu), { items: [] });
  assert.deepEqual(sanitizeCart("نص", menu), { items: [] });
  assert.deepEqual(sanitizeCart({ items: "خطأ" }, menu), { items: [] });

  const cleaned = sanitizeCart(
    {
      items: [
        { id: "fries", qty: 2 },
        { id: "unknown", qty: 3 },
        { id: "fries", qty: 1 },
        { id: "cola", qty: -4 },
        null,
        { id: "cola", qty: 1000 },
      ],
    },
    menu
  );

  assert.deepEqual(cleaned.items, [
    { id: "fries", qty: 3 },
    { id: "cola", qty: MAX_QUANTITY },
  ]);
  assert.equal(typeof CART_STORAGE_KEY, "string");
});

/* ───── التحقق من نموذج الطلب ───── */

test("التحقق يرفض الحقول الناقصة", () => {
  const result = validateCheckout({ name: "", phone: "", address: "" });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["address", "name", "phone"]);
});

test("التحقق يقبل طلباً صحيحاً ويوحّد رقم الهاتف", () => {
  const result = validateCheckout({
    name: "أحمد العبدالله",
    phone: "+962 79 123 4567",
    address: "عمّان، عبدون، شارع الأمير محمد، بناية 12، طابق 3",
    notes: "بدون بصل من فضلك",
  });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.phone, "0791234567");
  assert.equal(result.values.notes, "بدون بصل من فضلك");
});

test("أرقام الهاتف الأردنية تُقبل بأشكال مختلفة وتُرفض الأرقام غير الصحيحة", () => {
  for (const input of ["0791234567", "791234567", "+962791234567", "00962791234567", "078 123 4567"]) {
    assert.notEqual(normalizePhone(input), "", `كان يجب قبول ${input}`);
  }
  for (const input of ["", "12345", "0591234567", "07912345", "abcdefg", "07912345678"]) {
    assert.equal(normalizePhone(input), "", `كان يجب رفض ${input}`);
  }
});

test("الاسم القصير جداً أو العنوان غير المفصّل يُرفضان", () => {
  const shortName = validateCheckout({
    name: "أب",
    phone: "0791234567",
    address: "عمّان، عبدون، شارع الأمير محمد، بناية 12",
  });
  assert.equal(shortName.valid, false);
  assert.ok(shortName.errors.name);

  const shortAddress = validateCheckout({
    name: "أحمد العبدالله",
    phone: "0791234567",
    address: "عمّان",
  });
  assert.equal(shortAddress.valid, false);
  assert.ok(shortAddress.errors.address);
});

/* ───── رسالة واتساب ───── */

test("رسالة واتساب تحتوي المنتجات والكميات والأسعار والإجمالي وبيانات التوصيل", () => {
  const cart = {
    items: [
      { id: "classic-burger", qty: 2 },
      { id: "fries", qty: 1 },
      { id: "cola", qty: 3 },
    ],
  };

  const message = buildWhatsAppMessage({
    cart,
    menu,
    customer: {
      name: "أحمد العبدالله",
      phone: "0791234567",
      address: "عمّان، عبدون، شارع الأمير محمد، بناية 12",
      notes: "جرس مرتين",
    },
    settings: siteConfig,
  });

  const totals = getTotals(cart, menu, settings);
  assert.match(message, /كلاسيك برغر × 2/);
  assert.match(message, /بطاطا مقلية مقرمشة × 1/);
  assert.match(message, /كولا مثلجة × 3/);
  assert.ok(message.includes(formatMoney(totals.subtotal, siteConfig.currency)));
  assert.ok(message.includes(formatMoney(totals.total, siteConfig.currency)));
  assert.match(message, /أحمد العبدالله/);
  assert.match(message, /0791234567/);
  assert.match(message, /عبدون/);
  assert.match(message, /جرس مرتين/);
  assert.match(message, /رسوم التوصيل/);
});

test("رابط واتساب يُبنى فقط عند وجود رقم مضبوط", () => {
  assert.equal(buildWhatsAppUrl("", "مرحبا"), "");
  assert.equal(normalizeWhatsAppNumber(""), "");

  const url = buildWhatsAppUrl("+962 79 123 4567", "طلب تجريبي");
  assert.ok(url.startsWith("https://wa.me/962791234567?text="));
  assert.ok(decodeURIComponent(url.split("text=")[1]).includes("طلب تجريبي"));
});
