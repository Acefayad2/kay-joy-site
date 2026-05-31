const PRODUCTS = {
  "hi-c-spic": { name: "Hi C Spi C", price: 8 },
  "joy-bliss": { name: "Joy Bliss", price: 8 },
  heartbeat: { name: "HeartBEET", price: 8 },
  "all-smiles": { name: "All Smiles", price: 8 },
  "verde-rush": { name: "Verde' Rush", price: 9 },
  "kay-joy-pass-all-at-once": { name: "Kay Joy Monthly Pass", price: 35 },
  "kay-joy-pass-monthly-visits": { name: "Kay Joy Monthly Pass", price: 35 },
};

const PICKUP_ADDRESS = "3901 Calverton Boulevard, Beltsville, Maryland";
const SQUARE_VERSION = "2026-05-20";
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
const SQUARE_API_HOST = SQUARE_ENVIRONMENT === "sandbox"
  ? "https://connect.squareupsandbox.com"
  : "https://connect.squareup.com";

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

function getCartDetails(cart) {
  const lines = cart.map((cartItem) => {
    const product = PRODUCTS[cartItem.id];
    if (!product) throw new Error(`Unsupported cart item: ${cartItem.id}`);

    const quantity = Math.max(1, Math.min(20, Number.parseInt(cartItem.quantity, 10) || 1));
    return {
      name: product.name,
      quantity,
      price: product.price,
      total: product.price * quantity,
    };
  });

  const subtotal = lines.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.07;
  return {
    lines,
    subtotal,
    tax,
    total: subtotal + tax,
  };
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
    const billing = body.billing || {};
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
      billing.postalCode ? `Billing ZIP: ${clean(billing.postalCode)}` : "",
    ].filter(Boolean).join(" | ");

    const squareResponse = await fetch(`${SQUARE_API_HOST}/v2/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        source_id: sourceId,
        location_id: locationId,
        amount_money: {
          amount: Math.round(details.total * 100),
          currency: "USD",
        },
        note: note.slice(0, 500),
      }),
    });

    const squarePayload = await squareResponse.json();
    if (!squareResponse.ok) {
      return response(squareResponse.status, {
        error: squarePayload.errors?.[0]?.detail || squarePayload.errors?.[0]?.code || "Square could not complete the payment.",
        square: squarePayload.errors,
      });
    }

    return response(200, {
      paymentId: squarePayload.payment?.id,
      receiptUrl: squarePayload.payment?.receipt_url,
    });
  } catch (error) {
    return response(500, { error: error.message || "Unable to complete Square payment." });
  }
};
