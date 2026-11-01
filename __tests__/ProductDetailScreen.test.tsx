import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { productsApi } from '../src/api';
import { ProductDetailScreen } from '../src/features/products/screens/ProductDetailScreen';
import { product } from './fixtures/products';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockId = '7';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: mockReplace }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('lucide-react-native', () => ({ Share2: () => null }));
jest.mock('../src/api', () => ({ productsApi: { getById: jest.fn() } }));
const getById = jest.mocked(productsApi.getById);
beforeEach(() => { mockId = '7'; });
afterEach(() => jest.restoreAllMocks());

describe('HU-04: detalle y variantes reales', () => {
  test('consulta el ID real y muestra precio, existencias y descripción', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(getById).toHaveBeenCalledWith('7');
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.getByText('$250.00')).toBeTruthy();
    expect(screen.getByText('2 disponibles')).toBeTruthy();
    expect(screen.getByText('Balón de entrenamiento')).toBeTruthy();
    expect(screen.getByText('Balones')).toBeTruthy();
    expect(screen.getByText('Accesorios')).toBeTruthy();
  });
  test('cambiar variante actualiza conjuntamente precio, stock, atributos e imagen', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [...product.variants,
      { id: 12, sku: 'BAL-02', stock: 5, price: 270, images: ['https://example.test/red.png'], attributes: { Color: 'Rojo', Talla: 'M' } }] });
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Color: Rojo · Talla: M' }));
    expect(screen.getByText('$270.00')).toBeTruthy();
    expect(screen.getByText('5 disponibles')).toBeTruthy();
    expect(screen.getByText('SKU: BAL-02')).toBeTruthy();
    expect(screen.getByLabelText('Balón de fútbol, imagen 1').props.source.uri).toBe('https://example.test/red.png');
    expect(screen.queryByText('$250.00')).toBeNull();
  });
  test('muestra la variante agotada sin tomar el stock de otra variante', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [...product.variants,
      { id: 12, sku: 'BAL-02', stock: 0, price: 270, images: [], attributes: { Color: 'Rojo' } }] });
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Color: Rojo' }));
    expect(screen.getByText('Agotado')).toBeTruthy();
    expect(screen.queryByText('2 disponibles')).toBeNull();
    expect(screen.getByText('$270.00')).toBeTruthy();
  });
  test('no inventa precio cuando no hay variantes', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [] });
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Sin precio disponible')).toBeTruthy();
    expect(screen.queryByText('$250.00')).toBeNull();
  });
  test('rechaza un ID inválido sin consultar la API', async () => {
    mockId = 'undefined';
    await render(<ProductDetailScreen />);
    expect(getById).not.toHaveBeenCalled();
    expect(screen.getByText('Producto no encontrado')).toBeTruthy();
  });
  test('permite volver si el producto no existe', async () => {
    getById.mockResolvedValueOnce(null);
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByText('Volver'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  test('reintenta una consulta que falla y recupera el producto', async () => {
    getById.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Balón de fútbol')).toBeTruthy();
  });
  test('compartir abre el diálogo con la URL pública codificada del sitio', async () => {
    getById.mockResolvedValueOnce(product);
    const share = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: Share.sharedAction });
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Compartir producto' }));
    expect(share).toHaveBeenCalledWith({ message: 'Balón de fútbol\nhttps://sport-center-sitie.netlify.app/product/balon-de-futbol/24337' });
  });
});
