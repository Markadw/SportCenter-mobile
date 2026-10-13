import { fireEvent, render, screen } from '@testing-library/react-native';
import { productsApi } from '../src/api';
import { ProductDetailScreen } from '../src/features/products/screens/ProductDetailScreen';
import { product } from './fixtures/products';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ back: mockBack }) }));
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

  test('muestra descripción, categoría y atributos del producto', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Balón de entrenamiento')).toBeTruthy();
    expect(screen.getByText('Balones')).toBeTruthy();
    expect(screen.getByText('Accesorios')).toBeTruthy();
    expect(screen.getByText('Color')).toBeTruthy();
    expect(screen.getByText('Blanco')).toBeTruthy();
  });

  test('permite volver después de consultar un producto inexistente', async () => {
    getById.mockResolvedValueOnce(null);
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByText('Volver'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('aumenta la cantidad hasta el stock disponible y bloquea el incremento', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    const increase = screen.getByRole('button', { name: 'Aumentar cantidad' });
    await fireEvent.press(increase);
    expect(screen.getByText('2', { exact: true })).toBeTruthy();
    expect(increase).toBeDisabled();
    await fireEvent.press(increase);
    expect(screen.getByText('2', { exact: true })).toBeTruthy();
  });

  test('disminuye la cantidad hasta uno y bloquea el decremento', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    const decrease = screen.getByRole('button', { name: 'Disminuir cantidad' });
    expect(decrease).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    expect(decrease).not.toBeDisabled();
    await fireEvent.press(decrease);
    expect(screen.getByText('1', { exact: true })).toBeTruthy();
    expect(decrease).toBeDisabled();
    await fireEvent.press(decrease);
    expect(screen.getByText('1', { exact: true })).toBeTruthy();
  });
});
