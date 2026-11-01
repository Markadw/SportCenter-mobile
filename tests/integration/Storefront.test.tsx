import { fireEvent, render, screen } from '@testing-library/react-native';
import axiosClient from '../../src/api/axios';
import { FiltersProvider } from '../../src/features/catalog';
import { ProductsProvider } from '../../src/features/products/context/ProductsContext';
import { CatalogScreen } from '../../src/features/products/screens/CatalogScreen';
import { HomeScreen } from '../../src/features/home/screens/HomeScreen';
import { SportsRow } from '../../src/features/home/components/SportsRow';
import { rawProduct } from '../../__tests__/fixtures/products';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../../src/features/auth/context/SessionContext', () => ({ useSession: () => ({ session: null }) }));
jest.mock('../../src/api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('lucide-react-native', () => Object.fromEntries([
  'Search', 'User', 'ChevronRight', 'Home', 'SlidersHorizontal', 'Share2', 'ChevronDown', 'ChevronUp', 'X',
  'Activity', 'Bike', 'CircleDot', 'Dumbbell', 'Trophy', 'Zap',
].map((name) => [name, () => null])));
const get = jest.mocked(axiosClient.get);
const otherProduct = { ...rawProduct, id_producto: 8, producto: 'Balón de básquetbol', deportes: ['Básquetbol'] };

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ProductsProvider><FiltersProvider>{children}</FiltersProvider></ProductsProvider>
);

beforeEach(() => {
  get.mockImplementation(async (url) => {
    const data = url === '/products/get-all-products' ? [rawProduct, otherProduct]
      : url === '/products/get-all-categories' ? [{ id_categoria: 1, nombre: 'Accesorios', id_padre: null }]
      : url === '/products/get-all-marcas' ? [{ id_marca: 1, nombre: 'Sport Center', imagen: '' }]
      : url === '/products/menu/sports' ? [{ id_deporte: 1, nombre: 'Fútbol' }]
      : [];
    return { data };
  });
});

describe('CP-03: integración de vistas, contextos y servicios reales del cliente', () => {
  test('convierte la respuesta HTTP simulada y muestra el catálogo sin sesión', async () => {
    await render(<Providers><CatalogScreen /></Providers>);
    expect(await screen.findByText('Balón de fútbol')).toBeTruthy();
    expect(screen.getByText('2 resultados')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/products/get-all-products');
  });

  test('seleccionar un deporte en inicio actualiza el contexto y el catálogo', async () => {
    await render(<Providers><SportsRow /><CatalogScreen /></Providers>);
    expect(await screen.findByText('Balón de básquetbol')).toBeTruthy();
    await fireEvent.press(screen.getByText('Fútbol'));
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.queryByText('Balón de básquetbol')).toBeNull();
    expect(screen.getByText('1 resultados')).toBeTruthy();
  });

  test('un error del servicio llega a la pantalla y un reintento recupera los productos', async () => {
    const normalGet = get.getMockImplementation()!;
    let fail = true;
    get.mockImplementation(async (url, config) => {
      if (url === '/products/get-all-products' && fail) throw new Error('API no disponible');
      return normalGet(url, config);
    });
    await render(<Providers><CatalogScreen /></Providers>);
    expect(await screen.findByText('API no disponible')).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Balón de fútbol')).toBeTruthy();
    expect(screen.queryByText('No se pudo cargar el catálogo')).toBeNull();
  });

  test('inicio muestra productos recientes disponibles sin solicitar banners', async () => {
    const normalGet = get.getMockImplementation()!;
    get.mockImplementation(async (url, config) => url === '/products/get-all-products'
      ? { data: [rawProduct, { ...otherProduct, variantes: [] }] } : normalGet(url, config));
    await render(<Providers><HomeScreen /></Providers>);
    expect(await screen.findByText('Balón de fútbol')).toBeTruthy();
    expect(screen.queryByText('Balón de básquetbol')).toBeNull();
    expect(get.mock.calls.map(([url]) => url)).not.toContain('/company/banner');
  });
});
