const cart = JSON.parse(localStorage.getItem("kayJoyCart") || "[]");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const items = document.querySelector("[data-checkout-items]");
const empty = document.querySelector("[data-checkout-empty]");
const form = document.querySelector("[data-real-checkout-form]");
const toast = document.querySelector("[data-toast]");

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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!cart.length) {
    showToast("Add at least one drink before placing an order.");
    return;
  }

  const formData = new FormData(form);
  const name = formData.get("name");
  const day = formData.get("day");
  const time = formData.get("time");
  const orderId = Math.floor(1000 + Math.random() * 9000);

  localStorage.removeItem("kayJoyCart");
  showToast(`Order #${orderId} placed for ${name}. Pickup: ${day} at ${time} at 3901 Calverton Boulevard, Beltsville, Maryland.`);
  form.reset();
  items.innerHTML = "";
  empty.style.display = "grid";
  document.querySelector("[data-checkout-subtotal]").textContent = "$0.00";
  document.querySelector("[data-checkout-tax]").textContent = "$0.00";
  document.querySelector("[data-checkout-total]").textContent = "$0.00";
});

renderCheckout();
