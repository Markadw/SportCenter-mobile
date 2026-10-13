import { fireEvent, render, screen } from '@testing-library/react-native';
import { useFilters } from '../src/features/catalog';
import { useProducts } from '../src/features/products/context/ProductsContext';
import { CatalogScreen } from '../src/features/products/screens/CatalogScreen';
import { product } from './fixtures/products';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ ChevronRight: () => null,
  Home: () => null, SlidersHorizontal: () => null, Share2: () => null }));
jest.mock('../src/features/catalog', () => ({ useFilters: jest.fn() }));
jest.mock('../src/features/products/context/ProductsContext', () => ({ useProducts: jest.fn() }));
jest.mock('../src/features/products/components/FiltersModal', () => ({ FiltersModal: () => null }));

const productsState = jest.mocked(useProducts);
const filtersState = jest.mocked(useFilters);

beforeEach(() => {
  productsState.mockReturnValue({ products: [product], isLoading: false,
    error: null, refresh: jest.fn(), getById: jest.fn() });
  filtersState.mockReturnValue({ filters: { categoryId: null, brandId: null, sportName: null },
    categories: [{ id: 1, name: 'Accesorios', parentId: null }],
    brands: [{ id: 1, name: 'Sport Center', image: '' }], sports: [],
    activeCount: 0, setCategory: jest.fn(), setBrand: jest.fn(), setSport: jest.fn(), clearFilters: jest.fn() });
});

describe('HU-03: catálogo público', () => {
  test('muestra los productos y navega al detalle seleccionado sin sesión', async () => {
    await render(<CatalogScreen />);
    await fireEvent.press(screen.getByText('Balón de fútbol'));
    expect(mockPush).toHaveBeenCalledWith('/product/7');
  });

  test('muestra el estado de carga', async () => {
    productsState.mockReturnValue({ ...productsState(), products: [], isLoading: true });
    await render(<CatalogScreen />);
    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  test('muestra un error y permite reintentar', async () => {
    const refresh = jest.fn();
    productsState.mockReturnValue({ ...productsState(), products: [], error: 'Sin conexión', refresh });
    await render(<CatalogScreen />);
    expect(screen.getByText('No se pudo cargar el catálogo')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('acepta una categoría padre y combina el filtro de marca', async () => {
    const other = { ...product, id: 8, name: 'Otro balón', brand: 'Otra marca' };
    productsState.mockReturnValue({ ...productsState(), products: [product, other] });
    filtersState.mockReturnValue({ ...filtersState(), filters: { categoryId: 1, brandId: 1, sportName: null } });
    await render(<CatalogScreen />);
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.queryByText('Otro balón')).toBeNull();
  });

  test('filtra por el deporte seleccionado desde inicio', async () => {
    const other = { ...product, id: 8, name: 'Balón de básquetbol', sports: ['Básquetbol'] };
    productsState.mockReturnValue({ ...productsState(), products: [product, other] });
    filtersState.mockReturnValue({ ...filtersState(), filters: { categoryId: null, brandId: null, sportName: 'Fútbol' } });
    await render(<CatalogScreen />);
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.queryByText('Balón de básquetbol')).toBeNull();
  });

  test('informa cuando los filtros no tienen resultados', async () => {
    productsState.mockReturnValue({ ...productsState(), products: [] });
    await render(<CatalogScreen />);
    expect(screen.getByText('No hay productos con esos filtros.')).toBeTruthy();
  });

  test('divide el catálogo en páginas de 20 productos', async () => {
    productsState.mockReturnValue({ ...productsState(), products: Array.from({ length: 21 },
      (_, i) => ({ ...product, id: i + 1, name: `Producto ${i + 1}` })) });
    await render(<CatalogScreen />);
    expect(screen.queryByText('Producto 21')).toBeNull();
    await fireEvent.press(screen.getByText('2', { exact: true }));
    expect(screen.getByText('Producto 21')).toBeTruthy();
    expect(screen.queryByText('Producto 1', { exact: true })).toBeNull();
  });
});
