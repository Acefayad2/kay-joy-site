const details = document.querySelector("[data-success-details]");
const receiptLink = document.querySelector("[data-receipt-link]");
const lastOrder = JSON.parse(sessionStorage.getItem("kayJoyLastOrder") || "{}");
const receiptUrl = sessionStorage.getItem("kayJoyReceiptUrl");

if (lastOrder.pickupDay && lastOrder.pickupTime) {
  const pickup = document.createElement("div");
  const pickupLabel = document.createElement("span");
  const pickupValue = document.createElement("strong");
  pickupLabel.textContent = "Pickup";
  pickupValue.textContent = `${lastOrder.pickupDay} at ${lastOrder.pickupTime}`;
  pickup.append(pickupLabel, pickupValue);
  details.append(pickup);

  if (lastOrder.orderId) {
    const order = document.createElement("div");
    const orderLabel = document.createElement("span");
    const orderValue = document.createElement("strong");
    orderLabel.textContent = "Square order";
    orderValue.textContent = lastOrder.orderId;
    order.append(orderLabel, orderValue);
    details.append(order);
  }
}

if (receiptUrl) {
  receiptLink.href = receiptUrl;
  receiptLink.hidden = false;
}
