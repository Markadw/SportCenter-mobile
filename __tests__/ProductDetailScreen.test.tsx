import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { productsApi } from '../src/api';
import { ProductDetailScreen } from '../src/features/products/screens/ProductDetailScreen';
import { product } from './fixtures/products';
import { cartApi } from '../src/api/cartApi';
import { reviewsApi } from '../src/api/reviewsApi';

let mockSession: { accessToken: string; sessionId: string } | null = null;
jest.mock('../src/features/auth/context/SessionContext', () => ({ useSession: () => ({ session: mockSession }) }));
jest.mock('../src/api/cartApi', () => ({ cartApi: { add: jest.fn() } }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockId: string | string[] = '7';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockId }), Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: mockReplace, push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('lucide-react-native', () => ({ ChevronLeft: () => null, Minus: () => null, Plus: () => null, Share2: () => null, Star: () => null }));
jest.mock('../src/api/reviewsApi', () => ({ reviewsApi: { list: jest.fn() } }));
jest.mock('../src/api', () => ({ productsApi: { getById: jest.fn() } }));
const getById = jest.mocked(productsApi.getById);
beforeEach(() => { mockId = '7'; mockSession = null; jest.mocked(reviewsApi.list).mockResolvedValue({ reviews: [], average: 4.5, total: 3 }); });
afterEach(() => jest.restoreAllMocks());

describe('HU-04: detalle y variantes reales', () => {
  test('consulta el ID real y muestra precio, existencias y descripción', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(getById).toHaveBeenCalledWith('7');
    expect(screen.getByText('Balón de fútbol')).toBeTruthy();
    expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
    expect(screen.getByText('2 disponibles')).toBeTruthy();
    expect(screen.getByText('Balón de entrenamiento')).toBeTruthy();
    expect(screen.getByText('Balones')).toBeTruthy();
    expect(screen.getByText('Accesorios')).toBeTruthy();
  });
  test('cambiar variante actualiza conjuntamente precio, stock, atributos e imagen', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [...product.variants,
      { id: 12, sku: 'BAL-02', stock: 5, price: 270, images: ['https://example.test/red.png'], attributes: { Color: 'Rojo', Talla: 'M' } }] });
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Color: Rojo' }));
    expect(screen.getAllByText('$270.00').length).toBeGreaterThan(0);
    expect(screen.getByText('5 disponibles')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Talla: M' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.queryByText(/SKU|BAL-02/)).toBeNull();
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
    expect(screen.getAllByText('$270.00').length).toBeGreaterThan(0);
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


test("HU05: agregar usa variante seleccionada y cantidad, no ID de producto", async () => {
  mockSession = { accessToken: "token", sessionId: "product-session" };
  getById.mockResolvedValueOnce({ ...product, variants: [...product.variants,
    { id: 12, sku: "RED", stock: 3, price: 270, images: [], attributes: { Color: "Rojo" } }] });
  jest.mocked(cartApi.add).mockResolvedValueOnce({ id: 1, items: [], subtotal: 540, itemCount: 2 });
  await render(<ProductDetailScreen />);
  await fireEvent.press(screen.getByRole("radio", { name: "Color: Rojo" }));
  await fireEvent.press(screen.getByRole("button", { name: "Sumar cantidad" }));
  await fireEvent.press(screen.getByRole("button", { name: "Agregar al carrito" }));
  expect(cartApi.add).toHaveBeenCalledWith("token", 12, 2, expect.any(AbortSignal));
  expect(screen.getByText("Agregado al carrito.")).toBeTruthy();
});
test("HU05: variante agotada deshabilita el botón para agregar", async () => {
  mockSession = { accessToken: "token", sessionId: "product-session" };
  getById.mockResolvedValueOnce({ ...product, variants: [{ ...product.variants[0], stock: 0 }] });
  await render(<ProductDetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Agregar al carrito" }));
  expect(cartApi.add).not.toHaveBeenCalled();
});

test("una respuesta perdida al agregar ofrece consultar el carrito y no repite el POST automáticamente", async () => {
  mockSession = { accessToken: "token", sessionId: "product-session" };
  getById.mockResolvedValueOnce(product);
  jest.mocked(cartApi.add).mockRejectedValueOnce({ isAxiosError: true });
  await render(<ProductDetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Agregar al carrito" }));
  expect(screen.getByRole("button", { name: "Consultar carrito" })).toBeTruthy();
  expect(cartApi.add).toHaveBeenCalledTimes(1);
});

test("un invitado puede abrir las reseñas públicas desde el producto sin iniciar sesión", async () => {
  mockSession = null;
  getById.mockResolvedValueOnce(product);
  await render(<ProductDetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Ver reseñas del producto" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/reviews/[id]", params: { id: String(product.id) } });
  expect(cartApi.add).not.toHaveBeenCalled();
});


test("un ID ambiguo no selecciona arbitrariamente otro producto", async () => {
  mockId = ["7", "8"];
  await render(<ProductDetailScreen />);
  expect(getById).not.toHaveBeenCalled();
  expect(screen.getByText("Producto no encontrado")).toBeTruthy();
});

test("el invitado vuelve al mismo producto después de iniciar sesión", async () => {
  getById.mockResolvedValueOnce(product);
  await render(<ProductDetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión para agregar" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/login", params: { returnTo: "/product/" + product.id } });
  expect(cartApi.add).not.toHaveBeenCalled();
});

describe('detalle rediseñado: selectores dinámicos', () => {
  const variant = (id: number, attributes: Record<string, string>, stock = 4, price = 300) =>
    ({ id, sku: 'SKU-' + id, stock, price, images: [], attributes });

  test('una sola variante sin atributos no muestra selectores ni SKU y calcula el total', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [variant(1, {}, 3, 150)] });
    await render(<ProductDetailScreen />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(/SKU/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sumar cantidad' }));
    expect(screen.getByText('$300.00')).toBeTruthy();
    expect(screen.getByText(/máx\. 3/)).toBeTruthy();
  });

  test('separa color y talla, conserva el color y respeta combinaciones y existencias', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [
      variant(1, { Talla: 'S', Color: 'Negro' }, 2, 100), variant(2, { Talla: 'M', Color: 'Negro' }, 0, 110),
      variant(3, { Talla: 'S', Color: 'Azul' }, 5, 120), variant(4, { Talla: 'L', Color: 'Azul' }, 1, 130)] });
    await render(<ProductDetailScreen />);
    expect(screen.getAllByRole('radio').map(r => r.props.accessibilityLabel)).toEqual(
      ['Color: Negro', 'Color: Azul', 'Talla: S', 'Talla: M', 'Talla: L']);
    expect(screen.getByRole('radio', { name: 'Talla: M' }).props.accessibilityHint).toBe('Sin existencias');
    await fireEvent.press(screen.getByRole('radio', { name: 'Color: Azul' }));
    expect(screen.getByRole('radio', { name: 'Talla: S' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getAllByText('$120.00').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('radio', { name: 'Talla: L' }));
    expect(screen.getAllByText('$130.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sumar cantidad' }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('una variante agotada muestra Agotado y no permite agregar', async () => {
    mockSession = { accessToken: 'token', sessionId: 's' };
    getById.mockResolvedValueOnce({ ...product, variants: [variant(1, { Color: 'Rojo' }, 0)] });
    await render(<ProductDetailScreen />);
    expect(screen.getByText('Agotado')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar al carrito' }));
    expect(cartApi.add).not.toHaveBeenCalled();
  });

  test('varias variantes sin atributos se eligen por opción sin mostrar el SKU', async () => {
    getById.mockResolvedValueOnce({ ...product, variants: [variant(1, {}, 2, 100), variant(2, {}, 2, 200)] });
    await render(<ProductDetailScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Opción 2' }));
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText(/SKU/)).toBeNull();
  });

  test('las estrellas muestran el resumen real y abren las reseñas', async () => {
    getById.mockResolvedValueOnce(product);
    await render(<ProductDetailScreen />);
    expect(await screen.findByText('4.5 · 3 reseñas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver reseñas del producto' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reviews/[id]', params: { id: '7' } });
  });
});
