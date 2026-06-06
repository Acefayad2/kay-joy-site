const PRODUCTS = {
  "hi-c-spic": { name: "Hi C Spi C", price: 8, note: "Naval oranges, grapefruit, lemon, ginger, lime, turmeric" },
  "joy-bliss": { name: "Joy Bliss", price: 8, note: "Seeded watermelon, mint leaves, pineapple, lemon, ginger, lime" },
  heartbeat: { name: "HeartBEET", price: 8, note: "Beetroot, carrots, red apples, lemon, ginger" },
  "all-smiles": { name: "All Smiles", price: 8, note: "Strawberries, pineapple, cucumber, lemon, ginger" },
  "verde-rush": { name: "Verde' Rush", price: 8, note: "(Org.) kale, cucumbers, celery, cilantro, parsley, green apples, lemon, ginger, agave syrup" },
};

const PICKUP_ADDRESS = "3901 Calverton Boulevard, Beltsville, Maryland";
const SQUARE_VERSION = "2026-05-20";
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
const SQUARE_API_HOST = SQUARE_ENVIRONMENT === "sandbox"
  ? "https://connect.squareupsandbox.com"
  : "https://connect.squareup.com";
const TAX_RATE = 0.06;
const MEMBERSHIP_PRICE = 36;
const BOTTLE_RETURN_DISCOUNT = 5;

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function clean(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 240);
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validatePickup(pickup) {
  const day = clean(pickup.day);
  const time = clean(pickup.time);
  const allowedTimes = new Set(["12:00 PM", "4:00 PM"]);

  if (day !== "Saturday" || !allowedTimes.has(time)) {
    const error = new Error("Pickup is only available on Saturday at 12:00 PM or 4:00 PM.");
    error.statusCode = 400;
    throw error;
  }
}

function cleanFlavors(flavors) {
  const allowed = new Set(Object.values(PRODUCTS).map((product) => product.name));
  const cleaned = Array.isArray(flavors)
    ? flavors.map((flavor) => clean(flavor)).filter((flavor) => allowed.has(flavor)).slice(0, 5)
    : [];

  while (cleaned.length < 5) {
    cleaned.push("Customer choice");
  }

  return cleaned;
}

function resolveProduct(cartItem) {
  const standardProduct = PRODUCTS[cartItem.id];
  if (standardProduct) return standardProduct;

  const membershipMatch = String(cartItem.id || "").match(/^kay-joy-pass-(all-at-once|monthly-visits)(?:-reuse-(all|none|[0-3]))?$/);
  if (!membershipMatch) {
    throw new Error(`Unsupported cart item: ${cartItem.id}`);
  }

  const pickupLabel = membershipMatch[1] === "all-at-once"
    ? "Pickup preference: all 5 drinks at once"
    : "Pickup preference: 1 drink at a time throughout the month";
  const reuseValue = membershipMatch[2] || "none";
  const bottlesReused = reuseValue === "all" || (Number.parseInt(reuseValue, 10) || 0) > 0;
  const discount = bottlesReused ? BOTTLE_RETURN_DISCOUNT : 0;
  const flavors = cleanFlavors(cartItem.flavors);
  const discountNote = bottlesReused
    ? `Bottle return discount: all 5 bottles reused for ${formatMoney(discount * 100)} total off`
    : "No bottle return discount selected";

  return {
    name: "Kay Joy Monthly Pass",
    price: MEMBERSHIP_PRICE - discount,
    note: [
      "5 drinks for the month",
      pickupLabel,
      `Flavors: ${flavors.join(", ")}`,
      discountNote,
    ].join(". "),
  };
}

function getCartDetails(cart) {
  const lines = cart.map((cartItem) => {
    const product = resolveProduct(cartItem);

    const quantity = Math.max(1, Math.min(20, Number.parseInt(cartItem.quantity, 10) || 1));
    return {
      name: product.name,
      note: product.note,
      quantity,
      price: product.price,
      total: product.price * quantity,
    };
  });

  const subtotalCents = lines.reduce((sum, item) => sum + Math.round(item.total * 100), 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;
  return {
    lines,
    subtotalCents,
    taxCents,
    totalCents,
  };
}

async function squareRequest(path, accessToken, payload) {
  const squareResponse = await fetch(`${SQUARE_API_HOST}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(payload),
  });
  const squarePayload = await squareResponse.json();

  if (!squareResponse.ok) {
    const error = new Error(squarePayload.errors?.[0]?.detail || squarePayload.errors?.[0]?.code || "Square request failed.");
    error.statusCode = squareResponse.status;
    error.square = squarePayload.errors;
    throw error;
  }

  return squarePayload;
}

async function sendOrderNotification({ customer, pickup, details, payment, order }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFICATION_EMAIL;
  const from = process.env.ORDER_NOTIFICATION_FROM;

  if (!apiKey || !to || !from) {
    return false;
  }

  const pickupName = clean(pickup.name, clean(customer.name, "Customer"));
  const itemLines = details.lines
    .map((item) => `${item.quantity}x ${item.name} - ${formatMoney(Math.round(item.price * 100) * item.quantity)}`)
    .join("\n");
  const htmlLines = details.lines
    .map((item) => `<li><strong>${escapeHtml(item.quantity)}x ${escapeHtml(item.name)}</strong> - ${formatMoney(Math.round(item.price * 100) * item.quantity)}<br><span>${escapeHtml(item.note)}</span></li>`)
    .join("");
  const receiptUrl = payment?.receipt_url || "";

  const text = [
    "New Kay Joy pickup order",
    "",
    `Pickup: ${clean(pickup.day)} at ${clean(pickup.time)}`,
    `Pickup name: ${pickupName}`,
    `Pickup address: ${PICKUP_ADDRESS}`,
    "",
    "Customer",
    `Name: ${clean(customer.name, "Customer")}`,
    `Phone: ${clean(customer.phone, "Not provided")}`,
    `Email: ${clean(customer.email, "Not provided")}`,
    pickup.notes ? `Notes: ${clean(pickup.notes)}` : "",
    "",
    "Items",
    itemLines,
    "",
    `Subtotal: ${formatMoney(details.subtotalCents)}`,
    `Maryland sales tax: ${formatMoney(details.taxCents)}`,
    `Total paid: ${formatMoney(order?.total_money?.amount || details.totalCents)}`,
    "",
    `Square payment: ${payment?.id || "N/A"}`,
    `Square order: ${order?.id || "N/A"}`,
    receiptUrl ? `Receipt: ${receiptUrl}` : "",
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#173128;line-height:1.5">
      <h2 style="margin:0 0 12px">New Kay Joy pickup order</h2>
      <p><strong>Pickup:</strong> ${escapeHtml(clean(pickup.day))} at ${escapeHtml(clean(pickup.time))}<br>
      <strong>Pickup name:</strong> ${escapeHtml(pickupName)}<br>
      <strong>Address:</strong> ${escapeHtml(PICKUP_ADDRESS)}</p>
      <h3>Customer</h3>
      <p><strong>Name:</strong> ${escapeHtml(clean(customer.name, "Customer"))}<br>
      <strong>Phone:</strong> ${escapeHtml(clean(customer.phone, "Not provided"))}<br>
      <strong>Email:</strong> ${escapeHtml(clean(customer.email, "Not provided"))}</p>
      ${pickup.notes ? `<p><strong>Notes:</strong> ${escapeHtml(clean(pickup.notes))}</p>` : ""}
      <h3>Items</h3>
      <ul>${htmlLines}</ul>
      <p><strong>Subtotal:</strong> ${formatMoney(details.subtotalCents)}<br>
      <strong>Maryland sales tax:</strong> ${formatMoney(details.taxCents)}<br>
      <strong>Total paid:</strong> ${formatMoney(order?.total_money?.amount || details.totalCents)}</p>
      <p><strong>Square payment:</strong> ${escapeHtml(payment?.id || "N/A")}<br>
      <strong>Square order:</strong> ${escapeHtml(order?.id || "N/A")}</p>
      ${receiptUrl ? `<p><a href="${escapeHtml(receiptUrl)}">View Square receipt</a></p>` : ""}
    </div>
  `;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New Kay Joy order: ${pickupName} - ${formatMoney(order?.total_money?.amount || details.totalCents)}`,
      text,
      html,
    }),
  });

  if (!emailResponse.ok) {
    const payload = await emailResponse.json().catch(() => ({}));
    throw new Error(payload.message || "Order notification email failed.");
  }

  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  if (!accessToken || !locationId) {
    return response(500, { error: "Square payment is not configured yet." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const sourceId = clean(body.sourceId);

    if (!cart.length) return response(400, { error: "Your cart is empty." });
    if (!sourceId) return response(400, { error: "Square could not read the card payment token." });

    const customer = body.customer || {};
    const pickup = body.pickup || {};
    validatePickup(pickup);
    const details = getCartDetails(cart);
    const itemSummary = details.lines
      .map((item) => `${item.quantity}x ${item.name}`)
      .join(", ");
    const note = [
      `Kay Joy pickup order: ${itemSummary}`,
      `Pickup: ${clean(pickup.day, "Selected day")} at ${clean(pickup.time, "selected time")}`,
      `Pickup address: ${PICKUP_ADDRESS}`,
      `Customer: ${clean(customer.name, "Customer")}`,
      customer.phone ? `Phone: ${clean(customer.phone)}` : "",
      customer.email ? `Email: ${clean(customer.email)}` : "",
      pickup.name ? `Pickup name: ${clean(pickup.name)}` : "",
      pickup.notes ? `Notes: ${clean(pickup.notes)}` : "",
      `Maryland sales tax: $${(details.taxCents / 100).toFixed(2)}`,
    ].filter(Boolean).join(" | ");

    const orderPayload = await squareRequest("/v2/orders", accessToken, {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: locationId,
        source: { name: "Kay Joy website checkout" },
        line_items: details.lines.map((item) => ({
          name: item.name,
          note: item.note,
          quantity: String(item.quantity),
          base_price_money: {
            amount: Math.round(item.price * 100),
            currency: "USD",
          },
        })),
        taxes: [
          {
            uid: "maryland-sales-tax",
            name: "Maryland sales tax",
            percentage: "6",
            scope: "ORDER",
          },
        ],
      },
    });
    const order = orderPayload.order;
    const orderTotalCents = order?.total_money?.amount || details.totalCents;

    const squarePayload = await squareRequest("/v2/payments", accessToken, {
        idempotency_key: crypto.randomUUID(),
        source_id: sourceId,
        location_id: locationId,
        order_id: order?.id,
        amount_money: {
          amount: orderTotalCents,
          currency: "USD",
        },
        buyer_email_address: clean(customer.email),
        note: note.slice(0, 500),
    });
    let notificationSent = false;
    try {
      notificationSent = await sendOrderNotification({
        customer,
        pickup,
        details,
        payment: squarePayload.payment,
        order,
      });
    } catch (notificationError) {
      console.warn("Order notification failed:", notificationError.message);
    }

    return response(200, {
      paymentId: squarePayload.payment?.id,
      orderId: order?.id,
      receiptUrl: squarePayload.payment?.receipt_url,
      notificationSent,
    });
  } catch (error) {
    return response(error.statusCode || 500, {
      error: error.message || "Unable to complete Square payment.",
      square: error.square,
    });
  }
};
