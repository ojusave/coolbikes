// The bike list is fixed on purpose. The assignment asks for a static product list.
// Prices are in minor units: 89900 means €899.00. Adyen expects money this way.
// iDEAL only appears when the currency is EUR.
const bikes = [
  {
    id: "city",
    name: "City Step-Through",
    summary: "Upright city bike for Amsterdam streets.",
    image: "/bikes/city.jpg",
    price: { currency: "EUR", value: 89900 },
  },
  {
    id: "gravel",
    name: "Gravel",
    summary: "One bike for the canal path and the weekend.",
    image: "/bikes/gravel.jpg",
    price: { currency: "EUR", value: 189900 },
  },
  {
    id: "cargo",
    name: "Cargo",
    summary: "Front-loader for a kid, a dog, or the groceries.",
    image: "/bikes/cargo.jpg",
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
