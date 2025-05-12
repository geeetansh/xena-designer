import { ProductsList } from '@/components/ProductsList';

export default function ProductsPage() {
  return (
    <div className="max-w-6xl mx-auto w-full py-4 md:py-8">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">My Products</h1>
      <ProductsList />
    </div>
  );
}