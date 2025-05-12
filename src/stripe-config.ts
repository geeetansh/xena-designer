// Stripe product configuration
export const products = [
  {
    name: "500 credits every month",
    description: "Get 500 credits every month for your AI image generation needs",
    priceId: "price_1RMvZYF2bI4ojX8owZzL0B2T",
    mode: "subscription",
    price: "$199.00",
    credits: 500,
    isPopular: true,
    features: [
      "500 credits monthly",
      "Priority support",
      "Advanced image generation",
      "Unlimited variations",
      "Commercial usage rights"
    ]
  },
  {
    name: "1000 credit topup",
    description: "One-time purchase of 1000 credits",
    priceId: "price_1RMvZAF2bI4ojX8oNRHofr8e",
    mode: "payment",
    price: "$2.00",
    credits: 1000,
    features: [
      "1000 credits",
      "Never expires",
      "Commercial usage rights"
    ]
  },
  {
    name: "100 credit topup",
    description: "One-time purchase of 100 credits",
    priceId: "price_1RMvYxF2bI4ojX8oMHTLIdnu",
    mode: "payment",
    price: "$1.15",
    credits: 100,
    features: [
      "100 credits",
      "Never expires",
      "Commercial usage rights"
    ]
  },
  {
    name: "10 credit topup",
    description: "One-time purchase of 10 credits",
    priceId: "price_1RMvYhF2bI4ojX8oY93qcb91",
    mode: "payment",
    price: "$1.00",
    credits: 10,
    features: [
      "10 credits",
      "Never expires",
      "Commercial usage rights"
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