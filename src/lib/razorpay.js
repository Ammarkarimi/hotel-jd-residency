// Razorpay Checkout (UPI, cards, netbanking, wallets), loaded only when a guest pays.

let loading;
function loadRazorpay() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => {
      loading = undefined;
      s.remove();
      reject(new Error('The payment window could not be loaded. Please check your internet connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens the payment window. Resolves with Razorpay's payment details, or null if the guest closed it. */
export async function payWithRazorpay(options) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve) => {
    new Razorpay({
      ...options,
      theme: { color: '#17325a' },
      handler: resolve,
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    }).open();
  });
}
