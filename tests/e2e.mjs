/**
 * اختبار متصفح حقيقي (Chromium) للتحقق من السلة وحساب الأسعار على الهاتف والكمبيوتر.
 *
 * يشغّل خادم الموقع على منفذ مؤقت، ثم ينفّذ سيناريو كامل:
 * إضافة أصناف ← تعديل الكميات ← التحقق من الإجماليات ← إتمام الطلب مع التحقق من الحقول.
 *
 * التشغيل: node tests/e2e.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.E2E_PORT) || 4310;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: "هاتف (iPhone 13)", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: "كمبيوتر (1440×900)", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

let passed = 0;
const failures = [];

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${message}`);
  } else {
    failures.push(message);
    console.log(`  ❌ ${message}`);
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* الخادم لم يبدأ بعد */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`تعذّر تشغيل الخادم على ${url}`);
}

/** قراءة نصوص عناصر متعددة. */
async function texts(locator) {
  return (await locator.allTextContents()).map((text) => text.trim());
}

async function runScenario(browser, contextOptions, label) {
  console.log(`\n▶ ${label}`);
  const context = await browser.newContext({ ...contextOptions, locale: "ar-JO" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  /* ————— البنية العامة ————— */
  check((await page.getAttribute("html", "dir")) === "rtl", "الاتجاه RTL مضبوط على <html>");
  check((await page.getAttribute("html", "lang")) === "ar", "اللغة العربية مضبوطة على <html>");

  const heroHeading = (await page.locator("h1").first().innerText()).trim();
  check(heroHeading.length > 5, `العنوان الرئيسي ظاهر: «${heroHeading.split("\n")[0]}»`);

  const heroImage = page.locator(".hero__media img").first();
  await heroImage.waitFor({ state: "visible" });
  const heroLoaded = await heroImage.evaluate((img) => img.complete && img.naturalWidth > 0);
  check(heroLoaded, "الصورة الرئيسية تُحمّل فعلياً من الملف المحلي");

  /* ————— القائمة والتصنيفات ————— */
  const cards = page.locator("#menu-grid .product-card");
  await cards.first().waitFor({ state: "visible" });
  const cardCount = await cards.count();
  check(cardCount >= 9, `شبكة القائمة تعرض ${cardCount} صنفاً`);

  const firstCardImageLoaded = await page
    .locator("#menu-grid .product-card img")
    .first()
    .evaluate((img) => img.complete && img.naturalWidth > 0);
  check(firstCardImageLoaded, "صورة أول صنف تُحمّل فعلياً");

  const firstCardText = await cards.first().innerText();
  check(firstCardText.includes("د.أ"), "بطاقة الصنف تعرض السعر بالدينار الأردني");
  check(/كلاسيك برغر|دوبل تشيز/.test(firstCardText), "بطاقة الصنف تعرض الاسم والوصف");

  const popularCount = await page.locator("#popular-grid .product-card").count();
  check(popularCount >= 3, `قسم «الأكثر طلباً» يعرض ${popularCount} أصناف`);

  // تصفية التصنيفات
  const drinksTab = page.locator('[data-category="drinks"]');
  await drinksTab.click();
  await page.waitForFunction(() => document.querySelectorAll("#menu-grid .product-card").length === 4);
  const drinksCount = await cards.count();
  check(drinksCount === 4, `تبويب المشروبات يعرض ${drinksCount} أصناف فقط (من أصل ${cardCount})`);
  check(
    (await drinksTab.getAttribute("aria-selected")) === "true",
    "التبويب النشط يُعلَّم بـ aria-selected"
  );

  const sidesTab = page.locator('[data-category="sides"]');
  await sidesTab.click();
  await page.waitForFunction(() => document.querySelectorAll("#menu-grid .product-card").length === 3);
  check((await cards.count()) === 3, "تبويب الوجبات الجانبية يعرض 3 أصناف فقط");

  await page.locator('[data-category="all"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#menu-grid .product-card").length >= 9);

  /* ————— السلة: إضافة وكميات وإجماليات ————— */
  const badge = page.locator(".cart-count").first();
  check(await badge.isHidden(), "عداد السلة مخفي في البداية");

  await page.locator('[data-add="classic-burger"]').first().click();
  await page.waitForFunction(() => document.querySelector(".cart-count")?.textContent === "1");
  check((await badge.innerText()).trim() === "1", "إضافة صنف تُحدّث عداد السلة إلى 1");
  check(
    await page.locator('[data-foot="classic-burger"] .qty').first().isVisible(),
    "بعد الإضافة يظهر متحكّم الكمية داخل البطاقة"
  );

  await page.locator('[data-inc="classic-burger"]').first().click();
  await page.waitForFunction(
    () => document.querySelector('[data-foot="classic-burger"] .qty__value')?.textContent === "2"
  );
  check(
    (await page.locator('[data-foot="classic-burger"] .qty__value').first().innerText()).trim() === "2",
    "زر (+) يرفع الكمية إلى 2"
  );

  await page.locator('[data-add="fries"]').first().click();
  await page.waitForFunction(() => document.querySelector(".cart-count")?.textContent === "3");

  // فتح درج السلة
  await page.locator("[data-cart-open]").first().click();
  await page.locator("#cart-drawer").waitFor({ state: "visible" });
  check(await page.locator("#cart-drawer").isVisible(), "درج السلة يُفتح ويعرض المحتوى");
  check(
    (await page.locator("#cart-body .cart-item").count()) === 2,
    "الدرج يعرض سطرين (كلاسيك برغر + بطاطا)"
  );

  // الإجماليات: 4.50×2 + 2.00 = 11.00 و + 1.50 توصيل = 12.50
  const subtotal = (await page.locator('#cart-foot [data-cart-total="subtotal"]').innerText()).trim();
  const delivery = (await page.locator('#cart-foot [data-cart-total="delivery"]').innerText()).trim();
  const total = (await page.locator('#cart-foot [data-cart-total="total"]').innerText()).trim();
  check(subtotal.startsWith("11.00"), `إجمالي المنتجات = 11.00 د.أ (المعروض: ${subtotal})`);
  check(delivery.startsWith("1.50"), `رسوم التوصيل = 1.50 د.أ (المعروض: ${delivery})`);
  check(total.startsWith("12.50"), `الإجمالي النهائي = 12.50 د.أ (المعروض: ${total})`);

  check(
    await page.locator("#free-delivery").isVisible(),
    "شريط التوصيل المجاني يظهر قبل الوصول للحد الأدنى"
  );

  // إضافة صنف يبلغ بالطلب حدّ التوصيل المجاني (12.00)
  await page.locator('#cart-body [data-inc="fries"]').click();
  await page.waitForFunction(
    () => document.querySelector('#cart-foot [data-cart-total="total"]')?.textContent.includes("13.00")
  );
  const freeDeliveryNow = (await page.locator('#cart-foot [data-cart-total="delivery"]').innerText()).trim();
  check(freeDeliveryNow.startsWith("0.00"), "التوصيل يصبح مجانياً عند تجاوز الحد الأدنى");
  check(await page.locator("#free-delivery").isHidden(), "يختفي شريط «أضف كذا للتوصيل المجاني» بعد التفعيل");

  // تقليل الكمية وحذف صنف
  await page.locator('#cart-body [data-dec="fries"]').click();
  await page.waitForFunction(
    () => document.querySelector('#cart-foot [data-cart-total="subtotal"]')?.textContent.startsWith("11.00")
  );
  check(true, "زر (−) يعيد حساب الإجماليات فوراً");

  await page.locator('#cart-body [data-remove="fries"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#cart-body .cart-item").length === 1);
  check(
    (await page.locator("#cart-body .cart-item").count()) === 1,
    "زر الحذف يزيل الصنف من السلة"
  );

  /* ————— إتمام الطلب والتحقق من الحقول ————— */
  await page.locator("[data-go-checkout]").click();
  await page.waitForFunction(() => location.hash.startsWith("#/checkout"));
  await page.locator('[data-view="checkout"]').waitFor({ state: "visible" });
  check(await page.locator("#checkout-form").isVisible(), "الانتقال إلى صفحة إتمام الطلب يعمل");
  check(await page.locator("#cart-drawer").isHidden(), "درج السلة يُغلق عند الانتقال للدفع");

  const summaryLines = await page.locator("#checkout-lines .summary__line").count();
  check(summaryLines === 1, `ملخّص الطلب يعرض ${summaryLines} سطراً مطابقاً للسلة`);
  check(
    (await page.locator('#checkout-totals [data-summary="total"]').innerText()).startsWith("6.00"),
    "إجمالي ملخّص الطلب = 4.50 + 1.50 توصيل = 6.00 د.أ"
  );

  // إرسال النموذج فارغاً ← أخطاء تحقق
  await page.locator("#submit-order").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".field--error").length >= 3
  );
  const errorCount = await page.locator(".field--error").count();
  check(errorCount >= 3, `التحقق يُظهر ${errorCount} أخطاء للحقول الفارغة`);
  check(
    (await page.locator('[data-field="phone"] .field__error').innerText()).includes("رقم"),
    "رسالة خطأ رقم الهاتف واضحة"
  );
  check(await page.locator("#order-result").isHidden(), "لا تُجهَّز رسالة طلب برقم هاتف غير صالح");

  // تعبئة بيانات صحيحة
  await page.fill("#customer-name", "أحمد العبدالله");
  await page.fill("#customer-phone", "0791234567");
  await page.fill("#customer-address", "عمّان، عبدون، شارع الأمير محمد، بناية 12، طابق 3");
  await page.fill("#customer-notes", "بدون بصل، وجرس مرتين");
  await page.waitForFunction(() => document.querySelector("#notes-count").textContent !== "0");
  check(
    Number(await page.locator("#notes-count").innerText()) > 5,
    "عدّاد حروف الملاحظات يعمل"
  );
  check(
    (await page.locator(".field--error").count()) === 0,
    "تختفي أخطاء الحقول فور الكتابة"
  );

  // إرسال الطلب (لا يوجد رقم واتساب في الإعدادات الافتراضية)
  await page.locator("#submit-order").click();
  await page.locator("#order-result").waitFor({ state: "visible" });
  check(await page.locator("#order-result").isVisible(), "تظهر نتيجة الطلب بعد الإرسال الصحيح");
  check(
    await page.locator("#whatsapp-warning").isVisible(),
    "يظهر تنبيه أن رقم واتساب غير مضبوط في الإعدادات"
  );
  check(
    await page.locator("#order-result-link").isHidden(),
    "لا يُعرض رابط واتساب بدون رقم مضبوط (لا يوجد رقم حقيقي افتراضي)"
  );

  /* ————— الحفظ والاستمرارية ————— */
  await page.goto(`${BASE_URL}/#/`);
  await page.waitForFunction(() => document.querySelectorAll("#checkout-lines .summary__line").length === 1);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector(".cart-count")?.textContent === "1");
  check(true, "السلة محفوظة بعد إعادة تحميل الصفحة (localStorage)");

  /* ————— التذييل والمحتوى ————— */
  const footerText = (await page.locator(".site-footer").innerText()).replace(/\s+/g, " ");
  check(/السبت|الجمعة/.test(footerText), "ساعات العمل مذكورة في التذييل");
  check(/عمّان/.test(footerText), "موقع المطعم مذكور في التذييل");
  check(/واتساب/.test(footerText), "معلومات التواصل (واتساب) موجودة في التذييل");
  check(/تجريب/.test(footerText), "تنبيه واضح بأن الموقع والمطعم تجريبيان");

  /* ————— التجاوب: لا تمرير أفقي ————— */
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(overflow <= 1, `لا يوجد تمرير أفقي زائد على هذه الشاشة (${overflow}px)`);

  // العناصر الرئيسية داخل حدود الشاشة
  const cardBox = await page.locator("#menu-grid .product-card").first().boundingBox();
  const viewportWidth = page.viewportSize().width;
  check(
    cardBox.x >= -1 && cardBox.x + cardBox.width <= viewportWidth + 1,
    "بطاقة المنتج لا تخرج عن حدود الشاشة"
  );

  /* ————— أخطاء JS ————— */
  check(pageErrors.length === 0, `لا أخطاء JavaScript في الصفحة${pageErrors.length ? `: ${pageErrors[0]}` : ""}`);

  await context.close();
}

let server;
try {
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

  await waitForServer(`${BASE_URL}/healthz`);
  console.log(`الخادم يعمل على ${BASE_URL}`);

  const browser = await chromium.launch();
  try {
    for (const { name, ...options } of VIEWPORTS) {
      await runScenario(browser, options, name);
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  failures.push(`خطأ غير متوقع: ${error.message}`);
  console.error(error);
} finally {
  if (server) server.kill("SIGTERM");
}

console.log(`\nنتيجة الاختبار: ${passed} ناجح، ${failures.length} فاشل`);
if (failures.length > 0) {
  console.error("\nالإخفاقات:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("✅ نجحت جميع اختبارات المتصفح (هاتف + كمبيوتر)");
