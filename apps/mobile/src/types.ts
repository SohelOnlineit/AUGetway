export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  phone?: string | null;
};

export type CatalogImage = {
  id: string;
  url: string;
  alt: string | null;
};

export type ProductSummary = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  primaryImage: CatalogImage | null;
  category: { id: string; name: string; slug: string };
  ratingAverage: number | null;
  ratingCount: number;
  packageCount: number;
};

export type ProductPackage = {
  valueId: string;
  name: string;
  priceMinor: number;
  regions: string[];
  imageUrl: string | null;
  inStock: boolean;
  availableCount: number;
  instant: boolean;
};

export type CustomerInput = {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type ProductDetail = ProductSummary & {
  description: string | null;
  images: CatalogImage[];
  regions: string[];
  defaultRegion: string | null;
  packages: ProductPackage[];
  customerInputs: CustomerInput[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
};

export type CartItem = {
  id: string;
  productId: string;
  title: string;
  slug: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
  primaryImageUrl: string | null;
  packageValueId: string | null;
  packageName: string | null;
  region: string | null;
};

export type PublicCart = {
  id: string;
  items: CartItem[];
  itemCount: number;
  subtotalMinor: number;
  currency: string;
};

export type PaymentIntent = {
  id: string;
  orderId: string;
  orderNumber: string;
  checkoutUrl: string | null;
  sandboxMode: boolean;
  status: string;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  currency: string;
};
