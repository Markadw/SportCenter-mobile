import { render, screen } from '@testing-library/react-native';
import { productsApi } from '../src/api';
import { ProductDetailScreen } from '../src/features/products/screens/ProductDetailScreen';
import { product } from './fixtures/products';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ back: jest.fn() }) }));
jest.mock('lucide-react-native', () => ({ ArrowLeft: () => null, ChevronRight: () => null,
  Heart: () => null, Minus: () => null, Package: () => null, Plus: () => null,
  Share2: () => null, ShoppingCart: () => null, Truck: () => null }));
jest.mock('../src/api', () => ({ productsApi: { getById: jest.fn() } }));
const getById = jest.mocked(productsApi.getById);

describe('HU-04: detalle de producto', () => {
  test('muestra los datos del ID consultado desde la API', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(getById).toHaveBeenCalledWith('7');
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.getByText('$250.00')).toBeTruthy();
    expect(screen.getByText('2 disponibles')).toBeTruthy();
  });

  test('informa cuando el producto no existe', async () => {
    getById.mockResolvedValueOnce(null);
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Producto no encontrado')).toBeTruthy();
    expect(screen.getByText('Volver')).toBeTruthy();
  });

  test('muestra un error de conexión sin simular un producto', async () => {
    getById.mockRejectedValueOnce(new Error('Sin conexión'));
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    expect(screen.queryByText('Balón de fútbol')).toBeNull();
  });

  test('impide agregar un producto agotado', async () => {
    getById.mockResolvedValueOnce({ ...product, totalStock: 0, stock: 0 });
    await render(<ProductDetailScreen />);
    const labels = screen.getAllByText('Agotado');
    expect(labels).toHaveLength(2);
    expect(labels[1]).toBeDisabled();
  });
});
