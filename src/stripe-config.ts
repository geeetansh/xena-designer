// Stripe product configuration
export const products = [
  {
    name: "15 credits topup",
    description: "One-time purchase of 15 credits",
    priceId: "price_1ROSqdF2bI4ojX8oCnn1KrLz",
    mode: "payment",
    price: "$11.25",
    credits: 15,
    features: [
      "15 credits",
      "Never expires",
      "Commercial usage rights"
    ]
  },
  {
    name: "100 credits topup",
    description: "One-time purchase of 100 credits",
    priceId: "price_1ROSv9F2bI4ojX8oVfZTjrWc",
    mode: "payment",
    price: "$75.00",
    credits: 100,
    features: [
      "100 credits",
      "Never expires",
      "Commercial usage rights"
    ]
  },
  {
    name: "200 credits topup",
    description: "One-time purchase of 200 credits",
    priceId: "price_1ROSrtF2bI4ojX8oUXGfG4gl",
    mode: "payment",
    price: "$120.00",
    credits: 200,
    features: [
      "200 credits",
      "Never expires",
      "Commercial usage rights",
      "Bulk discount savings"
    ]
  },
  {
    name: "500 credits topup",
    description: "One-time purchase of 500 credits",
    priceId: "price_1ROSscF2bI4ojX8oqTG5shTT",
    mode: "payment",
    price: "$300.00",
    credits: 500,
    features: [
      "500 credits",
      "Never expires",
      "Commercial usage rights",
      "Premium bulk discount"
    ]
  },
  {
    name: "1000 credits topup",
    description: "One-time purchase of 1000 credits",
    priceId: "price_1ROStVF2bI4ojX8oin1uKTI9",
    mode: "payment",
    price: "$562.50",
    credits: 1000,
    features: [
      "1000 credits",
      "Never expires",
      "Commercial usage rights",
      "Maximum bulk savings"
    ]
  }
];

// Helper function to get product by price ID
export function getProductByPriceId(priceId: string) {
  return products.find(product => product.priceId === priceId);
}

// Helper function to get subscription product
export function getSubscriptionProduct() {
  return products.find(product => product.mode === "subscription");
}

// Helper function to get one-time payment products
export function getOneTimeProducts() {
  return products.filter(product => product.mode === "payment");
}