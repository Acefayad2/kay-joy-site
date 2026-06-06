const products = [
  {
    id: "hi-c-spic",
    name: "Hi C Spi C",
    price: 8,
    image: "assets/hi-c-spic.jpeg",
    benefits: "Revitalize, immunity support, citrusy spice",
    ingredients: "Naval oranges, grapefruit, lemon, ginger, lime, turmeric",
  },
  {
    id: "joy-bliss",
    name: "Joy Bliss",
    price: 8,
    image: "assets/joy-bliss.jpeg",
    benefits: "Invigorate, cellular hydration, recovery",
    ingredients: "Seeded watermelon, mint leaves, pineapple, lemon, ginger, lime",
  },
  {
    id: "heartbeat",
    name: "HeartBEET",
    price: 8,
    image: "assets/heartbeat.jpeg",
    benefits: "Energize, natural stamina, glow renewal",
    ingredients: "Beetroot, carrots, red apples, lemon, ginger",
  },
  {
    id: "all-smiles",
    name: "All Smiles",
    price: 8,
    image: "assets/all-smiles.jpeg",
    benefits: "Refresh, antioxidant rich, tropical delight",
    ingredients: "Strawberries, pineapple, cucumber, lemon, ginger",
  },
  {
    id: "verde-rush",
    name: "Verde' Rush",
    price: 8,
    image: "assets/verde-rush.jpeg",
    benefits: "Detoxify, cell nourishing, crisp greens",
    ingredients: "(Org.) kale, cucumbers, celery, cilantro, parsley, green apples, lemon, ginger, agave syrup",
  },
];

const membership = {
  id: "kay-joy-pass",
  name: "Kay Joy Monthly Pass",
  price: 37,
  benefits: "5 drinks for the month",
};
const BOTTLE_RETURN_DISCOUNT = 5;
const MAX_BOTTLE_RETURNS = 3;

const membershipPickupOptions = {
  "all-at-once": "Pickup preference: all 5 drinks at once",
  "monthly-visits": "Pickup preference: 1 drink at a time throughout the month",
};

const state = {
  cart: JSON.parse(localStorage.getItem("kayJoyCart") || "[]"),
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const TAX_RATE = 0.06;

const menu = document.querySelector("[data-menu]");
const membershipFlavorGrid = document.querySelector("[data-membership-flavors]");
const membershipPrice = document.querySelector("[data-membership-price]");
const cartPanel = document.querySelector("[data-cart-panel]");
const cartItems = document.querySelector("[data-cart-items]");
const cartEmpty = document.querySelector("[data-cart-empty]");
const scrim = document.querySelector("[data-scrim]");
const toast = document.querySelector("[data-toast]");
const checkoutForm = document.querySelector("[data-checkout-form]");

function renderMenu() {
  menu.innerHTML = products
    .map((product, index) => `
      <article class="product-card reveal" style="transition-delay:${index * 70}ms">
        <img src="${product.image}" alt="${product.name} cold press juice">
        <div class="product-body">
          <div>
            <h3>${product.name}</h3>
            <p class="product-meta">${product.benefits}</p>
            <p class="ingredients"><span>Ingredients</span>${product.ingredients}</p>
          </div>
          <div class="price-row">
            <span class="price">${money.format(product.price)}</span>
            <button class="mini-button" type="button" data-add="${product.id}">Add</button>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function renderMembershipFlavors() {
  if (!membershipFlavorGrid) return;

  const options = products
    .map((product) => `<option value="${product.name}">${product.name}</option>`)
    .join("");
  membershipFlavorGrid.innerHTML = Array.from({ length: 5 }, (_, index) => `
    <label>
      Drink ${index + 1}
      <select name="membership-flavor-${index + 1}" data-membership-flavor required>
        ${options}
      </select>
    </label>
  `).join("");
}

function findItem(id) {
  return products.find((product) => product.id === id) || membership;
}

function selectedMembership() {
  const selected = document.querySelector("input[name='membership-pickup']:checked");
  const pickupType = selected ? selected.value : "all-at-once";
  const bottleReturns = Math.max(0, Math.min(MAX_BOTTLE_RETURNS, Number.parseInt(document.querySelector("[data-bottle-returns]")?.value, 10) || 0));
  const discount = bottleReturns * BOTTLE_RETURN_DISCOUNT;
  const flavors = Array.from(document.querySelectorAll("[data-membership-flavor]"))
    .map((select) => select.value)
    .filter(Boolean);
  const flavorSummary = flavors.length ? `Flavors: ${flavors.join(", ")}` : "Flavors selected at pickup";
  const discountSummary = bottleReturns
    ? `Bottle return discount: ${bottleReturns} reused bottle${bottleReturns === 1 ? "" : "s"} for ${money.format(discount)} off`
    : "No bottle return discount selected";

  return {
    ...membership,
    id: `${membership.id}-${pickupType}-reuse-${bottleReturns}`,
    price: membership.price - discount,
    benefits: `${membership.benefits}. ${membershipPickupOptions[pickupType]}. ${flavorSummary}. ${discountSummary}`,
    pickupType,
    flavors,
    bottleReturns,
    discount,
  };
}

function updateMembershipPrice() {
  if (!membershipPrice) return;

  const bottleReturns = Math.max(0, Math.min(MAX_BOTTLE_RETURNS, Number.parseInt(document.querySelector("[data-bottle-returns]")?.value, 10) || 0));
  const discountedPrice = membership.price - (bottleReturns * BOTTLE_RETURN_DISCOUNT);
  membershipPrice.textContent = money.format(discountedPrice);
}

function addToCart(id, customItem) {
  const item = customItem || findItem(id);
  const existing = state.cart.find((cartItem) => cartItem.id === id);

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ ...item, quantity: 1 });
  }

  renderCart();
  showToast(`${item.name} added to cart`);
}

function updateQuantity(id, change) {
  const item = state.cart.find((cartItem) => cartItem.id === id);
  if (!item) return;

  item.quantity += change;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((cartItem) => cartItem.id !== id);
  }

  renderCart();
}

function totals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  return {
    subtotal,
    tax,
    total: subtotal + tax,
    count: state.cart.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function renderCart() {
  const summary = totals();
  localStorage.setItem("kayJoyCart", JSON.stringify(state.cart));

  document.querySelector("[data-cart-count]").textContent = summary.count;
  document.querySelector("[data-subtotal]").textContent = money.format(summary.subtotal);
  document.querySelector("[data-tax]").textContent = money.format(summary.tax);
  document.querySelector("[data-total]").textContent = money.format(summary.total);
  const inlineTotal = document.querySelector("[data-inline-total]");
  if (inlineTotal) inlineTotal.textContent = money.format(summary.total);

  cartEmpty.style.display = state.cart.length ? "none" : "block";
  cartItems.innerHTML = state.cart
    .map((item) => `
      <div class="cart-line">
        <div class="cart-row">
          <div>
            <strong>${item.name}</strong>
            <p class="fine-print">${item.benefits}</p>
          </div>
          <strong>${money.format(item.price * item.quantity)}</strong>
        </div>
        <div class="cart-row">
          <div class="qty" aria-label="${item.name} quantity">
            <button type="button" data-qty="${item.id}" data-change="-1" aria-label="Remove one ${item.name}">-</button>
            <strong>${item.quantity}</strong>
            <button type="button" data-qty="${item.id}" data-change="1" aria-label="Add one ${item.name}">+</button>
          </div>
          <span class="fine-print">${money.format(item.price)} each</span>
        </div>
      </div>
    `)
    .join("");
}

function openCart() {
  cartPanel.classList.add("is-open");
  scrim.classList.add("is-open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  cartPanel.classList.remove("is-open");
  scrim.classList.remove("is-open");
  cartPanel.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-open"), 2600);
}

function setupReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const qtyButton = event.target.closest("[data-qty]");

  if (addButton) {
    addToCart(addButton.dataset.add);
    openCart();
  }

  if (event.target.closest("[data-add-membership]")) {
    const item = selectedMembership();
    addToCart(item.id, item);
    openCart();
  }

  if (qtyButton) {
    updateQuantity(qtyButton.dataset.qty, Number(qtyButton.dataset.change));
  }

  if (event.target.closest("[data-open-cart]")) openCart();
  if (event.target.closest("[data-close-cart]")) closeCart();
});

document.addEventListener("change", (event) => {
  if (event.target.closest("[data-bottle-returns]")) {
    updateMembershipPrice();
  }
});

scrim.addEventListener("click", closeCart);

if (checkoutForm) {
  checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!state.cart.length) {
      showToast("Add at least one drink or membership before checkout.");
      openCart();
      return;
    }

    const form = new FormData(checkoutForm);
    const name = form.get("name");
    const day = form.get("day");
    const time = form.get("time");
    const orderId = Math.floor(1000 + Math.random() * 9000);

    showToast(`Order #${orderId} placed for ${name}. Pickup: ${day} at ${time} at 3901 Calverton Boulevard, Beltsville, Maryland.`);
    state.cart = [];
    checkoutForm.reset();
    renderCart();
    closeCart();
  });
}

renderMenu();
renderMembershipFlavors();
updateMembershipPrice();
renderCart();
setupReveal();
