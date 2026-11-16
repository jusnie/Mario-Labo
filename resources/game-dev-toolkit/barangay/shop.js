/**
 * shop.js — the sari-sari store inventory and Ernie's wallet.
 *
 * Session-only state: money and purchases reset on reload, exactly like the
 * previous build. Items are flavour only for now — you can buy them and they
 * appear in the bag, but nothing is usable yet.
 */

export const STARTING_MONEY = 50;

export const PRODUCTS = [
  { id: "sardinas", name: "Sardinas (555)", price: 18, unit: "lata", note: "Alamang sa tomato sauce" },
  { id: "lucky-me", name: "Lucky Me Pancit Canton", price: 15, unit: "pakete", note: "Kalamansi" },
  { id: "kopiko", name: "Kopiko Blanca", price: 12, unit: "sachet x3", note: "Tatlong sachet" },
  { id: "milo", name: "Milo", price: 10, unit: "sachet", note: "Maliit na sachet" },
  { id: "skyflakes", name: "SkyFlakes", price: 14, unit: "pack", note: "Anim na crackers" },
  { id: "rebisco", name: "Rebisco Sandwich", price: 8, unit: "piraso", note: "Vanilla" },
  { id: "coke-sakto", name: "Coke Sakto", price: 20, unit: "bote", note: "Malamig" },
  { id: "tubig", name: "Tubig (1.5L)", price: 15, unit: "bote", note: "Mineral" },
  { id: "sabon", name: "Sabon (Perla)", price: 9, unit: "piraso", note: "Panglaba" },
  { id: "toyo", name: "Toyo (Silver Swan)", price: 16, unit: "maliit", note: "300ml" },
  { id: "asin", name: "Asin", price: 5, unit: "pakete", note: "Isang pakete" },
  { id: "kandila", name: "Kandila", price: 12, unit: "piraso", note: "Habang may brownout" },
  { id: "baterya", name: "Baterya AA", price: 22, unit: "pares", note: "Para sa flashlight" },
  { id: "kendi", name: "Kendi", price: 3, unit: "piraso", note: "Kulay pula" },
];

export class Wallet {
  constructor(start = STARTING_MONEY) {
    this.money = start;
    this.bag = new Map();
  }
  canAfford(price) {
    return this.money >= price;
  }
  buy(product) {
    if (!this.canAfford(product.price)) return { ok: false, short: product.price - this.money };
    this.money -= product.price;
    this.bag.set(product.id, (this.bag.get(product.id) ?? 0) + 1);
    return { ok: true, money: this.money };
  }
  get items() {
    return [...this.bag.entries()];
  }
}
