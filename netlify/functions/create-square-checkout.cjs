const PRODUCTS = {
  "hi-c-spic": {
    name: "Hi C Spi C",
    price: 8,
    note: "Naval oranges, grapefruit, lemon, ginger, lime, turmeric",
  },
  "joy-bliss": {
    name: "Joy Bliss",
    price: 8,
    note: "Seeded watermelon, mint leaves, pineapple, lemon, ginger, lime",
  },
  heartbeat: {
    name: "HeartBEET",
    price: 8,
    note: "Beetroot, carrots, red apples, lemon, ginger",
  },
  "all-smiles": {
    name: "All Smiles",
    price: 8,
    note: "Strawberries, pineapple, cucumber, lemon, ginger",
  },
  "verde-rush": {
    name: "Verde' Rush",
    price: 8,
    note: "(Org.) kale, cucumbers, celery, cilantro, parsley, green apples, lemon, ginger, agave syrup",
  },
};

const PICKUP_ADDRESS = "3901 Calverton Boulevard, Beltsville, Maryland";
const SQUARE_VERSION = "2026-05-20";
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
const SQUARE_API_HOST = SQUARE_ENVIRONMENT === "sandbox"
  ? "https://connect.squareupsandbox.com"
  : "https://connect.squareup.com";
const TAX_RATE_PERCENT = "6";
const MEMBERSHIP_PRICE = 36;
const BOTTLE_RETURN_DISCOUNT = 5;
const MAX_BOTTLE_RETURNS = 3;

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

  const membershipMatch = String(cartItem.id || "").match(/^kay-joy-pass-(all-at-once|monthly-visits)(?:-reuse-([0-3]))?$/);
  if (!membershipMatch) {
    throw new Error(`Unsupported cart item: ${cartItem.id}`);
  }

  const pickupLabel = membershipMatch[1] === "all-at-once"
    ? "Pickup preference: all 5 drinks at once"
    : "Pickup preference: 1 drink at a time throughout the month";
  const bottleReturns = Math.max(0, Math.min(MAX_BOTTLE_RETURNS, Number.parseInt(membershipMatch[2], 10) || 0));
  const discount = bottleReturns > 0 ? BOTTLE_RETURN_DISCOUNT : 0;
  const flavors = cleanFlavors(cartItem.flavors);
  const discountNote = bottleReturns
    ? `Bottle return discount: ${bottleReturns} reused bottle${bottleReturns === 1 ? "" : "s"} for ${formatMoney(discount * 100)} total off`
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

function cartToLineItems(cart) {
  return cart.map((cartItem) => {
    const product = resolveProduct(cartItem);

    const quantity = Math.max(1, Math.min(20, Number.parseInt(cartItem.quantity, 10) || 1));
    return {
      name: product.name,
      quantity: String(quantity),
      note: product.note,
      base_price_money: {
        amount: Math.round(product.price * 100),
        currency: "USD",
      },
    };
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const siteUrl = (process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:5174").replace(/\/$/, "");

  if (!accessToken || !locationId) {
    return response(500, {
      error: "Square checkout is almost ready. Please contact Kay Joy to finish this order.",
      setup: "Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Netlify.",
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cart = Array.isArray(body.cart) ? body.cart : [];

    if (!cart.length) {
      return response(400, { error: "Your cart is empty." });
    }

    const lineItems = cartToLineItems(cart);
    const customer = body.customer || {};
    const pickup = body.pickup || {};
    validatePickup(pickup);
    const pickupSummary = [
      `Pickup: ${clean(pickup.day, "Selected day")} at ${clean(pickup.time, "selected time")}`,
      `Pickup address: ${PICKUP_ADDRESS}`,
      `Customer: ${clean(customer.name, "Customer")}`,
      customer.phone ? `Phone: ${clean(customer.phone)}` : "",
      customer.email ? `Email: ${clean(customer.email)}` : "",
      pickup.name ? `Pickup name: ${clean(pickup.name)}` : "",
      pickup.notes ? `Notes: ${clean(pickup.notes)}` : "",
    ].filter(Boolean).join(" | ");

    const squareResponse = await fetch(`${SQUARE_API_HOST}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        description: `Kay Joy pickup order for ${clean(customer.name, "customer")}`,
        payment_note: pickupSummary.slice(0, 500),
        order: {
          location_id: locationId,
          source: { name: "Kay Joy website preorder" },
          line_items: lineItems,
          taxes: [
            {
              uid: "sales-tax",
              name: "Maryland sales tax",
              percentage: TAX_RATE_PERCENT,
              scope: "ORDER",
            },
          ],
        },
        checkout_options: {
          ask_for_shipping_address: false,
          redirect_url: `${siteUrl}/success.html`,
        },
      }),
    });

    const squarePayload = await squareResponse.json();
    if (!squareResponse.ok) {
      return response(squareResponse.status, {
        error: squarePayload.errors?.[0]?.detail || squarePayload.errors?.[0]?.code || "Square checkout could not be created.",
        square: squarePayload.errors,
      });
    }

    return response(200, {
      checkoutUrl: squarePayload.payment_link?.url || squarePayload.payment_link?.long_url,
      orderId: squarePayload.payment_link?.order_id,
    });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || "Unable to create Square checkout." });
  }
};
