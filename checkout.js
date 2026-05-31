const cart = JSON.parse(localStorage.getItem("kayJoyCart") || "[]");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const items = document.querySelector("[data-checkout-items]");
const empty = document.querySelector("[data-checkout-empty]");
const form = document.querySelector("[data-real-checkout-form]");
const toast = document.querySelector("[data-toast]");
const submitButton = document.querySelector("[data-checkout-submit]");
const statusLine = document.querySelector("[data-checkout-status]");

function totals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.07;
  return { subtotal, tax, total: subtotal + tax };
}

function renderCheckout() {
  const summary = totals();
  empty.style.display = cart.length ? "none" : "grid";
  items.innerHTML = cart.map((item) => `
    <div class="checkout-line">
      <div>
        <strong>${item.name}</strong>
        <p>${item.benefits}</p>
        <span>Qty ${item.quantity}</span>
      </div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </div>
  `).join("");

  document.querySelector("[data-checkout-subtotal]").textContent = money.format(summary.subtotal);
  document.querySelector("[data-checkout-tax]").textContent = money.format(summary.tax);
  document.querySelector("[data-checkout-total]").textContent = money.format(summary.total);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-open"), 3600);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Opening Square..." : "Pay with Square";
  statusLine.textContent = isLoading ? "Creating a secure Square checkout link." : "Square will confirm payment after checkout.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cart.length) {
    showToast("Add at least one drink before placing an order.");
    return;
  }

  const formData = new FormData(form);
  setLoading(true);

  try {
    const response = await fetch("/.netlify/functions/create-square-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cart,
        customer: {
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
        },
        pickup: {
          name: formData.get("pickupName"),
          day: formData.get("day"),
          time: formData.get("time"),
          notes: formData.get("notes"),
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.checkoutUrl) {
      throw new Error(payload.error || "Square checkout is not available yet.");
    }

    sessionStorage.setItem("kayJoyLastOrder", JSON.stringify({
      orderId: payload.orderId,
      pickupDay: formData.get("day"),
      pickupTime: formData.get("time"),
    }));
    localStorage.removeItem("kayJoyCart");
    window.location.href = payload.checkoutUrl;
  } catch (error) {
    showToast(error.message);
    setLoading(false);
    statusLine.textContent = error.message;
  }
});

renderCheckout();
