// Prices are minor units: 89900 = €899.00
const bikes = [
  {
    id: "city",
    name: "City Step-Through",
    summary: "Upright city bike for Amsterdam streets.",
    price: { currency: "EUR", value: 89900 },
  },
  {
    id: "gravel",
    name: "Gravel",
    summary: "One bike for the canal path and the weekend.",
    price: { currency: "EUR", value: 189900 },
  },
  {
    id: "cargo",
    name: "Cargo",
    summary: "Front-loader for a kid, a dog, or the groceries.",
    price: { currency: "EUR", value: 329900 },
  },
];

export function staticCatalog() {
  return {
    listProducts() {
      return bikes;
    },
    getProduct(id) {
      return bikes.find((bike) => bike.id === id) ?? null;
    },
  };
}
