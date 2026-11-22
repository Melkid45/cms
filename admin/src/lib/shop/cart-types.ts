export interface CartItem {
  id: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  currency: string;
  quantity: number;
  limit: number;
}
export interface CartResult {
  items: CartItem[];
  adjusted: boolean;
}
export const cartLimit = 99;
