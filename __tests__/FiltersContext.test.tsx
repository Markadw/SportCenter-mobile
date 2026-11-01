import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import type { Category } from '../src/api/catalogApi';
import { catalogApi } from '../src/api';
import { FiltersProvider, useFilters } from '../src/features/catalog/context/FiltersContext';

jest.mock('../src/api', () => ({ catalogApi: {
  getCategories: jest.fn(), getBrands: jest.fn(), getSports: jest.fn(),
} }));
const wrapper = ({ children }: PropsWithChildren) => <FiltersProvider>{children}</FiltersProvider>;

beforeEach(() => {
  jest.mocked(catalogApi.getCategories).mockReset().mockResolvedValue([{ id: 1, name: 'Balones', parentId: null }]);
  jest.mocked(catalogApi.getBrands).mockReset().mockResolvedValue([{ id: 2, name: 'Sport Center', image: '' }]);
  jest.mocked(catalogApi.getSports).mockReset().mockResolvedValue([{ id: 3, name: 'Fútbol' }]);
});

describe('HU-03: selección y limpieza de filtros', () => {
  test('carga las opciones y comienza sin filtros activos', async () => {
    const { result } = await renderHook(() => useFilters(), { wrapper });
    expect(result.current.categories[0].name).toBe('Balones');
    expect(result.current.brands[0].name).toBe('Sport Center');
    expect(result.current.sports[0].name).toBe('Fútbol');
    expect(result.current.activeCount).toBe(0);
  });

  test('permite combinar categoría, marca y deporte', async () => {
    const { result } = await renderHook(() => useFilters(), { wrapper });
    await act(async () => {
      result.current.setCategory(1);
      result.current.setBrand(2);
      result.current.setSport('Fútbol');
    });
    expect(result.current.filters).toEqual({ categoryId: 1, brandId: 2, sportName: 'Fútbol' });
    expect(result.current.activeCount).toBe(3);
  });

  test('limpiar filtros elimina todas las selecciones y el contador', async () => {
    const { result } = await renderHook(() => useFilters(), { wrapper });
    await act(async () => {
      result.current.setCategory(1);
      result.current.setBrand(2);
      result.current.setSport('Fútbol');
    });
    await act(async () => { result.current.clearFilters(); });
    expect(result.current.filters).toEqual({ categoryId: null, brandId: null, sportName: null });
    expect(result.current.activeCount).toBe(0);
  });

  test('retirar un filtro conserva las demás selecciones', async () => {
    const { result } = await renderHook(() => useFilters(), { wrapper });
    await act(async () => {
      result.current.setCategory(1);
      result.current.setBrand(2);
      result.current.setSport('Fútbol');
    });
    await act(async () => { result.current.setBrand(null); });
    expect(result.current.filters).toEqual({ categoryId: 1, brandId: null, sportName: 'Fútbol' });
    expect(result.current.activeCount).toBe(2);
  });
});


function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('recuperación independiente de opciones', () => {
  test('si marcas falla conserva categorías y deportes; el reintento recupera sólo marcas sin borrar selecciones', async () => {
    jest.mocked(catalogApi.getBrands).mockRejectedValueOnce(new Error('detalle interno de red'));
    const { result } = await renderHook(useFilters, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toEqual([{ id: 1, name: 'Balones', parentId: null }]);
    expect(result.current.sports).toEqual([{ id: 3, name: 'Fútbol' }]);
    expect(result.current.brands).toEqual([]);
    expect(result.current.loadErrors).toEqual({ brands: 'No pudimos cargar marcas.' });
    expect(result.current.loadError).toContain('marcas');
    expect(result.current.loadError).not.toContain('detalle interno');
    await act(() => { result.current.setCategory(1); result.current.setSport('Fútbol'); });
    const categories = result.current.categories, sports = result.current.sports;
    await act(async () => { await result.current.retryLoad?.(); });
    expect(result.current.brands[0].name).toBe('Sport Center');
    expect(result.current.categories).toBe(categories);
    expect(result.current.sports).toBe(sports);
    expect(result.current.filters).toEqual({ categoryId: 1, brandId: null, sportName: 'Fútbol' });
    expect(result.current.activeCount).toBe(2);
    expect(result.current.loadError).toBeNull();
    expect(catalogApi.getCategories).toHaveBeenCalledTimes(1);
    expect(catalogApi.getSports).toHaveBeenCalledTimes(1);
    expect(catalogApi.getBrands).toHaveBeenCalledTimes(2);
  });

  test('una respuesta antigua de una carga cancelada no sobrescribe las opciones recuperadas', async () => {
    const first = pending<Category[]>();
    jest.mocked(catalogApi.getCategories).mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([{ id: 8, name: 'Ropa', parentId: null }]);
    const { result } = await renderHook(useFilters, { wrapper });
    const previousSignal = jest.mocked(catalogApi.getCategories).mock.calls[0][0];
    await act(async () => { await result.current.retryLoad?.(); });
    expect(previousSignal?.aborted).toBe(true);
    expect(result.current.categories[0].name).toBe('Ropa');
    await act(async () => first.resolve([{ id: 99, name: 'Respuesta antigua', parentId: null }]));
    expect(result.current.categories).toEqual([{ id: 8, name: 'Ropa', parentId: null }]);
    expect(result.current.loading).toBe(false);
  });

  test('desmontar aborta la red e ignora una respuesta tardía sin lanzar otra consulta', async () => {
    const response = pending<Category[]>();
    jest.mocked(catalogApi.getCategories).mockReturnValueOnce(response.promise);
    const { result, unmount } = await renderHook(useFilters, { wrapper });
    const signal = jest.mocked(catalogApi.getCategories).mock.calls[0][0];
    const snapshot = result.current;
    await unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => response.resolve([{ id: 99, name: 'Tardío', parentId: null }]));
    expect(result.current).toBe(snapshot);
    await result.current.retryLoad?.();
    expect(catalogApi.getCategories).toHaveBeenCalledTimes(1);
  });
});
