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
const cardStatus = document.querySelector("[data-card-status]");

let card;
let squareReady = false;

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
  submitButton.disabled = isLoading || !squareReady;
  submitButton.textContent = isLoading ? "Processing..." : "Complete payment";
  statusLine.textContent = isLoading ? "Square is securely processing the payment." : "Square will confirm payment on this page.";
}

function paymentDetails(formData) {
  return {
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
    billing: {
      name: formData.get("billingName"),
      address: formData.get("billingAddress"),
      city: formData.get("billingCity"),
      state: formData.get("billingState"),
      postalCode: formData.get("billingPostalCode"),
    },
  };
}

function squareVerificationDetails(formData) {
  const summary = totals();
  return {
    amount: summary.total.toFixed(2),
    billingContact: {
      givenName: String(formData.get("billingName") || formData.get("name") || "").trim(),
      addressLines: String(formData.get("billingAddress") || "").trim()
        ? [String(formData.get("billingAddress")).trim()]
        : [],
      city: String(formData.get("billingCity") || "").trim(),
      state: String(formData.get("billingState") || "").trim().toUpperCase(),
      postalCode: String(formData.get("billingPostalCode") || "").trim(),
      countryCode: "US",
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
    },
    currencyCode: "USD",
    intent: "CHARGE",
  };
}

async function setupSquareCard() {
  submitButton.disabled = true;

  try {
    if (!window.Square) {
      throw new Error("Square payment fields could not load. Refresh the page and try again.");
    }

    const response = await fetch("/.netlify/functions/square-config");
    const config = await response.json();

    if (!config.configured) {
      throw new Error("Square embedded payment needs the Square Application ID added in Netlify.");
    }

    const payments = window.Square.payments(config.applicationId, config.locationId);
    card = await payments.card({
      style: {
        input: {
          fontSize: "16px",
          fontWeight: "600",
        },
        ".input-container": {
          borderColor: "#d7decf",
          borderRadius: "8px",
        },
        ".input-container.is-focus": {
          borderColor: "#438f52",
        },
      },
    });
    await card.attach("#card-container");
    squareReady = true;
    submitButton.disabled = false;
    cardStatus.textContent = "Card fields are ready.";
  } catch (error) {
    squareReady = false;
    submitButton.disabled = true;
    cardStatus.textContent = error.message;
    statusLine.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cart.length) {
    showToast("Add at least one drink before placing an order.");
    return;
  }

  if (!squareReady || !card) {
    showToast("Square payment fields are not ready yet.");
    return;
  }

  const formData = new FormData(form);
  setLoading(true);

  try {
    const tokenResult = await card.tokenize(squareVerificationDetails(formData));
    if (tokenResult.status !== "OK") {
      const message = tokenResult.errors?.[0]?.message || "Please check the card details.";
      throw new Error(message);
    }

    const response = await fetch("/.netlify/functions/create-square-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...paymentDetails(formData),
        sourceId: tokenResult.token,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.paymentId) {
      throw new Error(payload.error || "Square could not complete the payment.");
    }

    sessionStorage.setItem("kayJoyLastOrder", JSON.stringify({
      orderId: payload.paymentId,
      pickupDay: formData.get("day"),
      pickupTime: formData.get("time"),
    }));
    if (payload.receiptUrl) {
      sessionStorage.setItem("kayJoyReceiptUrl", payload.receiptUrl);
    }
    localStorage.removeItem("kayJoyCart");
    window.location.href = "success.html";
  } catch (error) {
    showToast(error.message);
    setLoading(false);
    statusLine.textContent = error.message;
  }
});

renderCheckout();
setupSquareCard();
