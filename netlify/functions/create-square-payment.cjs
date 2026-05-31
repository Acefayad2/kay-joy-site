const PRODUCTS = {
  "hi-c-spic": { name: "Hi C Spi C", price: 8, note: "Naval oranges, grapefruit, lemon, ginger, lime, turmeric" },
  "joy-bliss": { name: "Joy Bliss", price: 8, note: "Seeded watermelon, mint leaves, pineapple, lemon, ginger, lime" },
  heartbeat: { name: "HeartBEET", price: 8, note: "Beetroot, carrots, red apples, lemon, ginger" },
  "all-smiles": { name: "All Smiles", price: 8, note: "Strawberries, pineapple, cucumber, lemon, ginger" },
  "verde-rush": { name: "Verde' Rush", price: 9, note: "(Org.) kale, cucumbers, celery, cilantro, parsley, green apples, lemon, ginger, agave syrup" },
  "kay-joy-pass-all-at-once": { name: "Kay Joy Monthly Pass", price: 38, note: "5 drinks for the month. Pickup preference: all 5 drinks at once" },
  "kay-joy-pass-monthly-visits": { name: "Kay Joy Monthly Pass", price: 38, note: "5 drinks for the month. Pickup preference: 1 drink at a time throughout the month" },
};

const PICKUP_ADDRESS = "3901 Calverton Boulevard, Beltsville, Maryland";
const SQUARE_VERSION = "2026-05-20";
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
const SQUARE_API_HOST = SQUARE_ENVIRONMENT === "sandbox"
  ? "https://connect.squareupsandbox.com"
  : "https://connect.squareup.com";
const TAX_RATE = 0.06;

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

    return response(200, {
      paymentId: squarePayload.payment?.id,
      orderId: order?.id,
      receiptUrl: squarePayload.payment?.receipt_url,
    });
  } catch (error) {
    return response(error.statusCode || 500, {
      error: error.message || "Unable to complete Square payment.",
      square: error.square,
    });
  }
};
