function response(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

exports.handler = async () => {
  const applicationId = process.env.SQUARE_APPLICATION_ID || "";
  const locationId = process.env.SQUARE_LOCATION_ID || "";
  const environment = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";

  return response(200, {
    configured: Boolean(applicationId && locationId),
    applicationId,
    locationId,
    environment,
  });
};
