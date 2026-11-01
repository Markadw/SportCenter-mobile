import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useFilters } from '../src/features/catalog';
import { useProducts } from '../src/features/products/context/ProductsContext';
import { useCatalogViewModel } from '../src/features/catalog/hooks/useCatalogViewModel';
import { AppHeader } from '../src/components/AppHeader';
import { StartupGate } from '../src/features/startup/StartupGate';
import { ProductImage } from '../src/components/ProductImage';
import { productPriceRange, productWebsiteUrl } from '../src/features/products/presentation';
import { Text } from 'react-native';
import { product } from './fixtures/products';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('lucide-react-native', () => ({ Search: () => null, User: () => null }));
jest.mock('../src/features/auth/context/SessionContext', () => ({ useSession: () => ({ session: null }) }));
jest.mock('../src/features/catalog', () => ({ useFilters: jest.fn() }));
jest.mock('../src/features/products/context/ProductsContext', () => ({ useProducts: jest.fn() }));
beforeEach(() => {
  mockParams = {};
  jest.mocked(useProducts).mockReturnValue({ products: [product, { ...product, id: 8, name: 'Playera azul', description: 'Ropa', sports: ['Gym'], price: 100, variants: [{ ...product.variants[0], price: 100 }] }], isLoading: false, error: null, refresh: jest.fn(), getById: jest.fn() });
  jest.mocked(useFilters).mockReturnValue({ categories: [], brands: [], sports: [], filters: { categoryId: null, brandId: null, sportName: null }, activeCount: 0, catalogRequest: null, requestCatalog: jest.fn(), clearFilters: jest.fn(), setCategory: jest.fn(), setBrand: jest.fn(), setSport: jest.fn() });
});
test('la búsqueda enviada desde el encabezado se aplica al catálogo sin distinguir acentos', async () => {
  await render(<AppHeader />);
  await fireEvent.changeText(screen.getByLabelText('Buscar productos'), 'futbol');
  await fireEvent(screen.getByLabelText('Buscar productos'), 'submitEditing');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/catalog', params: { q: 'futbol' } });
  mockParams = mockPush.mock.calls[0][0].params;
  const { result } = await renderHook(useCatalogViewModel);
  expect(result.current.filtered.map(p => p.id)).toEqual([7]);
});
test('combina palabras de marca y descripción, y borrar permite ver todo', async () => {
  mockParams = { q: 'Sport entrenamiento' };
  const { result } = await renderHook(useCatalogViewModel);
  expect(result.current.filtered.map(p => p.id)).toEqual([7]);
  await act(async () => { result.current.clear(); });
  expect(result.current.filtered).toHaveLength(2);
});
test('una búsqueda nueva por URL reemplaza la anterior en la pestaña montada', async () => {
  mockParams = { q: 'futbol' };
  const { result, rerender } = await renderHook(useCatalogViewModel);
  mockParams = { q: 'playera' };
  await rerender({});
  expect(result.current.query).toBe('playera');
  expect(result.current.filtered.map(p => p.id)).toEqual([8]);
});
test('ordena por precio de variante y valida el rango antes de filtrarlo', async () => {
  const { result } = await renderHook(useCatalogViewModel);
  await act(async () => { result.current.setSort('priceAsc'); });
  expect(result.current.filtered.map(p => p.id)).toEqual([8, 7]);
  await act(async () => { result.current.setMinPrice('200'); result.current.setMaxPrice('300'); });
  expect(result.current.filtered.map(p => p.id)).toEqual([7]);
  await act(async () => { result.current.setMaxPrice('50'); });
  expect(result.current.priceError).toMatch(/mínimo no puede/);
});
test('un rango entre precios de variantes sin ninguna coincidencia no devuelve el producto', async () => {
  jest.mocked(useProducts).mockReturnValue({ ...jest.mocked(useProducts)(), products: [{ ...product, variants: [{ ...product.variants[0], price: 100 }, { ...product.variants[0], id: 12, price: 300 }] }] });
  const { result } = await renderHook(useCatalogViewModel);
  await act(async () => { result.current.setMinPrice('150'); result.current.setMaxPrice('250'); });
  expect(result.current.filtered).toHaveLength(0);
});
test('el rango de la tarjeta conserva los precios reales de todas las variantes', () => {
  expect(productPriceRange({ ...product, variants: [...product.variants, { ...product.variants[0], id: 12, price: 270.5 }] })).toBe('$250.00 – $270.50');
  expect(productPriceRange({ ...product, variants: [] })).toBeNull();
  expect(productWebsiteUrl({ ...product, id: 34, name: 'Short Deportivo para Hombre Marca Nike' })).toBe('https://sport-center-sitie.netlify.app/product/short-deportivo-para-hombre-marca-nike/924634');
});
test('la carga inicial termina al resolver la consulta y no vuelve durante una recarga', async () => {
  const view = await render(<StartupGate loading><Text>Tienda</Text></StartupGate>);
  expect(screen.getByText('Preparando tu tienda…')).toBeTruthy();
  await view.rerender(<StartupGate loading={false}><Text>Tienda</Text></StartupGate>);
  expect(screen.queryByText('Preparando tu tienda…')).toBeNull();
  await view.rerender(<StartupGate loading><Text>Tienda</Text></StartupGate>);
  expect(screen.getByText('Tienda')).toBeTruthy();
  expect(screen.queryByText('Preparando tu tienda…')).toBeNull();
});
test('una imagen fallida muestra un mensaje local y permite la imagen de otra variante', async () => {
  const view = await render(<ProductImage uri="https://example.test/one.png" label="Producto" />);
  await fireEvent(screen.getByLabelText('Producto'), 'error');
  expect(screen.getByText('Imagen no disponible')).toBeTruthy();
  await view.rerender(<ProductImage uri="https://example.test/two.png" label="Producto" />);
  expect(screen.getByLabelText('Producto').props.source.uri).toBe('https://example.test/two.png');
});

test('cargar más conserva el bloque anterior y un filtro nuevo reinicia el límite', async () => {
  jest.mocked(useProducts).mockReturnValue({ ...jest.mocked(useProducts)(), products: Array.from({ length: 45 }, (_, i) => ({ ...product, id: i + 1 })) });
  const { result } = await renderHook(useCatalogViewModel);
  expect(result.current.visibleProducts).toHaveLength(20);
  await act(async () => { result.current.loadMore(); });
  expect(result.current.visibleProducts).toHaveLength(40);
  expect(result.current.visibleProducts[0].id).toBe(1);
  await act(async () => { result.current.setQuery('futbol'); });
  expect(result.current.visibleProducts).toHaveLength(20);
});

test('una selección nueva desde Inicio limpia la búsqueda anterior y puede repetir la misma consulta', async () => {
  mockParams = { q: 'futbol' };
  const { result, rerender } = await renderHook(useCatalogViewModel);
  expect(result.current.query).toBe('futbol');
  jest.mocked(useFilters).mockReturnValue({ ...jest.mocked(useFilters)(), catalogRequest: { key: 1, query: '' } });
  mockParams = { q: '' };
  await rerender({});
  expect(result.current.query).toBe('');
  jest.mocked(useFilters).mockReturnValue({ ...jest.mocked(useFilters)(), catalogRequest: { key: 2, query: 'futbol' } });
  await rerender({});
  expect(result.current.filtered.map(p => p.id)).toEqual([7]);
});

test('abrir otro catálogo desde Inicio también retira el rango y reinicia el orden', async () => {
  const { result, rerender } = await renderHook(useCatalogViewModel);
  await act(async () => { result.current.setMinPrice('200'); result.current.setSort('priceDesc'); });
  expect(result.current.filtered).toHaveLength(1);
  jest.mocked(useFilters).mockReturnValue({ ...jest.mocked(useFilters)(), catalogRequest: { key: 1, query: '' } });
  await rerender({});
  expect(result.current.minPrice).toBe('');
  expect(result.current.maxPrice).toBe('');
  expect(result.current.sort).toBe('recent');
  expect(result.current.filtered).toHaveLength(2);
});
