import axiosClient from '../src/api/axios';
import { productsApi } from '../src/api/productsApi';
import { rawProduct } from './fixtures/products';

jest.mock('../src/api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = jest.mocked(axiosClient.get);

describe('MOB-004 / HU-03 / HU-04: consumo de productos', () => {
  test('convierte el contrato del backend y suma el stock de las variantes', async () => {
    get.mockResolvedValueOnce({ data: [rawProduct] });
    const result = await productsApi.getAll();
    expect(get).toHaveBeenCalledWith('/products/get-all-products');
    expect(result[0]).toMatchObject({ id: 7, name: 'Balón de fútbol',
      price: 250, stock: 2, totalStock: 5, mainImage: 'https://example.test/ball.png',
      attributes: { Color: 'Blanco' }, sports: ['Fútbol'] });
    expect(result[0].variants[1]).toMatchObject({ id: 12, stock: 3, price: 270 });
  });

  test('acepta un catálogo vacío', async () => {
    get.mockResolvedValueOnce({ data: [] });
    await expect(productsApi.getAll()).resolves.toEqual([]);
  });

  test('maneja productos sin variantes ni deportes', async () => {
    get.mockResolvedValueOnce({ data: [{ ...rawProduct, variantes: null, deportes: null }] });
    const [result] = await productsApi.getAll();
    expect(result).toMatchObject({ variants: [], sports: [], mainImage: null,
      price: 0, stock: 0, totalStock: 0, attributes: {} });
  });

  test('consulta el ID seleccionado y convierte el arreglo de detalle', async () => {
    get.mockResolvedValueOnce({ data: [rawProduct] });
    await expect(productsApi.getById('7')).resolves.toMatchObject({ id: 7 });
    expect(get).toHaveBeenCalledWith('/products/get-product-details/7');
  });

  test.each([[], null, {}])('no inventa un producto ante un detalle ausente: %p', async (data) => {
    get.mockResolvedValueOnce({ data });
    await expect(productsApi.getById(404)).resolves.toBeNull();
  });

  test('propaga el error de red para que la pantalla lo maneje', async () => {
    get.mockRejectedValueOnce(new Error('Sin conexión'));
    await expect(productsApi.getAll()).rejects.toThrow('Sin conexión');
  });
});
