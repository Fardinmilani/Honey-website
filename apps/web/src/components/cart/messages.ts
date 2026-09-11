import type { Locale } from '@honey/i18n';

export type CartMessages = Readonly<{
  title: string;
  loading: string;
  emptyTitle: string;
  emptyDescription: string;
  browseProducts: string;
  summary: string;
  unitPrice: string;
  lineTotal: string;
  subtotal: string;
  discount: string;
  tax: string;
  taxUnresolved: string;
  total: string;
  coupon: string;
  couponPlaceholder: string;
  applyCoupon: string;
  removeCoupon: string;
  couponApplied: string;
  couponDeferred: string;
  couponIneligible: string;
  quantity: string;
  decreaseQuantity: string;
  increaseQuantity: string;
  removeLine: string;
  unavailable: string;
  unpublished: string;
  priceUnavailable: string;
  available: string;
  lowStock: string;
  outOfStock: string;
  quantityAdjusted: string;
  requestError: string;
  unavailableError: string;
  rateLimitError: string;
  invalidCouponError: string;
  retry: string;
  updating: string;
}>;

const messages: Readonly<Record<Locale, CartMessages>> = {
  en: {
    title: 'Your cart',
    loading: 'Loading your cart…',
    emptyTitle: 'Your cart is empty',
    emptyDescription: 'Choose a jar from the collection to begin your order.',
    browseProducts: 'Browse products',
    summary: 'Order summary',
    unitPrice: 'Unit price',
    lineTotal: 'Line total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    taxUnresolved: 'Tax is not yet determined.',
    total: 'Merchandise total',
    coupon: 'Promotion code',
    couponPlaceholder: 'Enter code',
    applyCoupon: 'Apply code',
    removeCoupon: 'Remove code',
    couponApplied: 'Promotion applied',
    couponDeferred: 'Promotion saved for a later order step',
    couponIneligible: 'This promotion cannot be applied to the current cart',
    quantity: 'Quantity',
    decreaseQuantity: 'Decrease quantity',
    increaseQuantity: 'Increase quantity',
    removeLine: 'Remove item',
    unavailable: 'Currently unavailable',
    unpublished: 'This item is no longer available',
    priceUnavailable: 'Price is currently unavailable',
    available: 'Available',
    lowStock: 'Limited availability',
    outOfStock: 'Out of stock',
    quantityAdjusted: 'The quantity was adjusted to the currently available amount.',
    requestError: 'We could not update your cart. Please try again.',
    unavailableError: 'That quantity is no longer available.',
    rateLimitError: 'Please wait a moment before trying again.',
    invalidCouponError: 'That promotion code cannot be applied to this cart.',
    retry: 'Try again',
    updating: 'Updating your cart…',
  },
  fa: {
    title: 'سبد خرید شما',
    loading: 'سبد خرید شما در حال بارگذاری است…',
    emptyTitle: 'سبد خرید شما خالی است',
    emptyDescription: 'برای آغاز سفارش، یک شیشه از مجموعه انتخاب کنید.',
    browseProducts: 'مشاهده محصولات',
    summary: 'خلاصه سفارش',
    unitPrice: 'قیمت واحد',
    lineTotal: 'جمع ردیف',
    subtotal: 'جمع جزء',
    discount: 'تخفیف',
    tax: 'مالیات',
    taxUnresolved: 'مالیات هنوز مشخص نشده است.',
    total: 'جمع کالاها',
    coupon: 'کد تخفیف',
    couponPlaceholder: 'کد را وارد کنید',
    applyCoupon: 'اعمال کد',
    removeCoupon: 'حذف کد',
    couponApplied: 'کد تخفیف اعمال شد',
    couponDeferred: 'کد تخفیف برای مرحله بعدی سفارش ذخیره شد',
    couponIneligible: 'این کد برای سبد خرید فعلی قابل اعمال نیست',
    quantity: 'تعداد',
    decreaseQuantity: 'کاهش تعداد',
    increaseQuantity: 'افزایش تعداد',
    removeLine: 'حذف کالا',
    unavailable: 'فعلاً ناموجود',
    unpublished: 'این کالا دیگر قابل خرید نیست',
    priceUnavailable: 'قیمت کالا فعلاً در دسترس نیست',
    available: 'موجود',
    lowStock: 'موجودی محدود',
    outOfStock: 'ناموجود',
    quantityAdjusted: 'تعداد کالا بر اساس موجودی فعلی به‌روزرسانی شد.',
    requestError: 'به‌روزرسانی سبد خرید ممکن نشد. دوباره تلاش کنید.',
    unavailableError: 'این تعداد دیگر موجود نیست.',
    rateLimitError: 'لطفاً چند لحظه صبر کرده و دوباره تلاش کنید.',
    invalidCouponError: 'این کد تخفیف برای این سبد قابل اعمال نیست.',
    retry: 'تلاش دوباره',
    updating: 'سبد خرید شما در حال به‌روزرسانی است…',
  },
};

export function cartMessages(locale: Locale): CartMessages {
  return messages[locale];
}
