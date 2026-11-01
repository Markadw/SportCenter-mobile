import axiosClient from '../src/api/axios';
import { catalogApi } from '../src/api/catalogApi';

jest.mock('../src/api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = jest.mocked(axiosClient.get);

describe('HU-03 / MOB-004: datos disponibles para los filtros', () => {
  test('conserva la categoría padre al convertir las categorías', async () => {
    get.mockResolvedValueOnce({ data: [
      { id_categoria: 1, nombre: 'Accesorios', id_padre: null },
      { id_categoria: 2, nombre: 'Balones', id_padre: 1 },
    ] });
    await expect(catalogApi.getCategories()).resolves.toEqual([
      { id: 1, name: 'Accesorios', parentId: null },
      { id: 2, name: 'Balones', parentId: 1 },
    ]);
    expect(get).toHaveBeenCalledWith('/products/get-all-categories');
  });

  test('conserva el nombre y la imagen de la marca', async () => {
    get.mockResolvedValueOnce({ data: [
      { id_marca: 3, nombre: 'Sport Center', imagen: 'https://example.test/brand.png' },
    ] });
    await expect(catalogApi.getBrands()).resolves.toEqual([
      { id: 3, name: 'Sport Center', image: 'https://example.test/brand.png' },
    ]);
    expect(get).toHaveBeenCalledWith('/products/get-all-marcas');
  });

  test('conserva los nombres de los deportes utilizados para filtrar', async () => {
    get.mockResolvedValueOnce({ data: [
      { id_deporte: 4, nombre: 'Fútbol' }, { id_deporte: 5, nombre: 'Básquetbol' },
    ] });
    await expect(catalogApi.getSports()).resolves.toEqual([
      { id: 4, name: 'Fútbol' }, { id: 5, name: 'Básquetbol' },
    ]);
    expect(get).toHaveBeenCalledWith('/products/menu/sports');
  });

  test.each(['getCategories', 'getBrands', 'getSports'] as const)(
    '%s admite una lista vacía sin inventar opciones', async (method) => {
      get.mockResolvedValueOnce({ data: [] });
      await expect(catalogApi[method]()).resolves.toEqual([]);
    },
  );

  test.each(['getCategories', 'getBrands', 'getSports'] as const)(
    '%s propaga un error de conexión', async (method) => {
      get.mockRejectedValueOnce(new Error('Sin conexión'));
      await expect(catalogApi[method]()).rejects.toThrow('Sin conexión');
    },
  );
});


test.each([
  ['getCategories', '/products/get-all-categories'],
  ['getBrands', '/products/get-all-marcas'],
  ['getSports', '/products/menu/sports'],
] as const)('%s transmite la señal para cancelar su petición sin cambiar el endpoint', async (method, url) => {
  get.mockResolvedValueOnce({ data: [] });
  const controller = new AbortController();
  await catalogApi[method](controller.signal);
  expect(get).toHaveBeenCalledWith(url, { signal: controller.signal });
  controller.abort();
  expect(get.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
