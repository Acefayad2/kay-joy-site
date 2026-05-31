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
    price: 9,
    note: "(Org.) kale, cucumbers, celery, cilantro, parsley, green apples, lemon, ginger, agave syrup",
  },
  "kay-joy-pass-all-at-once": {
    name: "Kay Joy Monthly Pass",
    price: 35,
    note: "5 drinks for the month. Pickup preference: all 5 drinks at once",
  },
  "kay-joy-pass-monthly-visits": {
    name: "Kay Joy Monthly Pass",
    price: 35,
    note: "5 drinks for the month. Pickup preference: 1 drink at a time throughout the month",
  },
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

function cartToLineItems(cart) {
  return cart.map((cartItem) => {
    const product = PRODUCTS[cartItem.id];
    if (!product) {
      throw new Error(`Unsupported cart item: ${cartItem.id}`);
    }

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
    const prePopulatedData = {};
    if (clean(customer.email)) prePopulatedData.buyer_email = clean(customer.email);
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
              name: "Sales tax estimate",
              percentage: "7",
              scope: "ORDER",
            },
          ],
        },
        checkout_options: {
          ask_for_shipping_address: false,
          redirect_url: `${siteUrl}/success.html`,
        },
        pre_populated_data: prePopulatedData,
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
    return response(500, { error: error.message || "Unable to create Square checkout." });
  }
};
