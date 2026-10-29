/**
 * 🍔 بيانات القائمة — عدّل الأسماء والأوصاف والأسعار والصور من هنا.
 *
 * price: السعر بالدينار الأردني (رقم فقط، بدون رمز العملة).
 * image: مسار الصورة داخل مجلد public.
 * popular: true لإظهار الصنف في قسم "الأكثر طلباً" في الصفحة الرئيسية.
 * category: يجب أن يطابق أحد معرّفات التصنيفات أدناه.
 */

export const categories = [
  { id: "burgers", name: "برغر", description: "لحم طازج وخبز بريوش محضّر يومياً" },
  { id: "sides", name: "وجبات جانبية", description: "مقرمشات تُحضَّر عند الطلب" },
  { id: "drinks", name: "مشروبات", description: "باردة ومنعشة" },
];

export const menu = [
  {
    id: "classic-burger",
    category: "burgers",
    name: "كلاسيك برغر",
    description:
      "لحم بقري طازج 120 غراماً، خس، طماطم، بصل، مخلل، وصوص Burger House في خبز بريوش طري.",
    price: 4.5,
    image: "/assets/images/classic.webp",
    imageAlt: "برغر كلاسيكي بخبز بريوش مع خس وطماطم",
    popular: true,
    badge: "الأكثر طلباً",
  },
  {
    id: "double-cheese",
    category: "burgers",
    name: "دوبل تشيز برغر",
    description:
      "قطعتا لحم بقري مشوي، جبنة شيدر مضاعفة، بصل مكرمل، وصوص خاص — لِمن يريد وجبة دسمة.",
    price: 6.25,
    image: "/assets/images/double.webp",
    imageAlt: "برغر مزدوج بقطعتَي لحم وجبنة شيدر",
    popular: true,
    badge: "اختيار الشيف",
  },
  {
    id: "crispy-chicken",
    category: "burgers",
    name: "برغر الدجاج المقرمش",
    description:
      "صدر دجاج مقرمش، مايونيز بالثوم، خس آيسبرغ، وطماطم — بديل خفيف ولذيذ.",
    price: 5.0,
    image: "/assets/images/chicken.webp",
    imageAlt: "برغر دجاج مقرمش مع خس وطماطم",
    popular: true,
  },
  {
    id: "smoky-bbq",
    category: "burgers",
    name: "برغر باربكيو مدخّن",
    description:
      "لحم بقري مدخّن، صلصة باربكيو، حلقات بصل مقرمشة، وجبنة سويسرية ذائبة.",
    price: 5.75,
    image: "/assets/images/bbq.webp",
    imageAlt: "برغر بصلصة باربكيو وحلقات بصل",
  },
  {
    id: "veggie-burger",
    category: "burgers",
    name: "برغر نباتي",
    description:
      "قرص حمص وخضار مشوية، جبنة نباتية، خس، طماطم، وصوص الطحينة — خيار نباتي كامل.",
    price: 4.75,
    image: "/assets/images/veggie.webp",
    imageAlt: "برغر نباتي بخضار مشوية",
  },
  {
    id: "fries",
    category: "sides",
    name: "بطاطا مقلية مقرمشة",
    description: "بطاطا مقطعة يدوياً، مقلية حتى القرمشة، مع رشة ملح بحري.",
    price: 2.0,
    image: "/assets/images/fries.webp",
    imageAlt: "بطاطا مقلية مقرمشة في وعاء ورقي",
    popular: true,
  },
  {
    id: "onion-rings",
    category: "sides",
    name: "حلقات البصل",
    description: "حلقات بصل مغطاة بخلطة مقرمشة، مع صوص الرانش للغمس.",
    price: 2.75,
    image: "/assets/images/rings.webp",
    imageAlt: "حلقات بصل مقلية مقرمشة",
  },
  {
    id: "chicken-fingers",
    category: "sides",
    name: "أصابع الدجاج (6 قطع)",
    description: "أصابع دجاج طرية بخلطة توابل خاصة، مع صوص الثوم.",
    price: 3.5,
    image: "/assets/images/nuggets.webp",
    imageAlt: "أصابع دجاج مقرمشة مع صوص",
  },
  {
    id: "cola",
    category: "drinks",
    name: "كولا مثلجة",
    description: "علبة 330 مل، تُقدَّم باردة مع الثلج.",
    price: 1.0,
    image: "/assets/images/cola.webp",
    imageAlt: "كوب كولا مثلج",
  },
  {
    id: "vanilla-shake",
    category: "drinks",
    name: "ميلك شيك فانيلا",
    description: "ميلك شيك كريمي بالفانيلا الحقيقية، 400 مل.",
    price: 2.75,
    image: "/assets/images/shake.webp",
    imageAlt: "كوب ميلك شيك فانيلا كريمي",
    badge: "مفضل",
  },
  {
    id: "mint-lemonade",
    category: "drinks",
    name: "ليموناضة بالنعناع",
    description: "ليمون طازج، نعناع، وثلج مجروش — منعشة جداً.",
    price: 1.75,
    image: "/assets/images/lemonade.webp",
    imageAlt: "كوب ليموناضة بالنعناع والثلج",
  },
  {
    id: "peach-iced-tea",
    category: "drinks",
    name: "شاي مثلج بالخوخ",
    description: "شاي مثلج بطعم الخوخ، خفيف الحلاوة، 400 مل.",
    price: 1.5,
    image: "/assets/images/icedtea.webp",
    imageAlt: "كوب شاي مثلج بالخوخ",
  },
];

export default menu;
