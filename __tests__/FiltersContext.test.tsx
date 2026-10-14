import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { catalogApi } from '../src/api';
import { FiltersProvider, useFilters } from '../src/features/catalog/context/FiltersContext';

jest.mock('../src/api', () => ({ catalogApi: {
  getCategories: jest.fn(), getBrands: jest.fn(), getSports: jest.fn(),
} }));
const wrapper = ({ children }: PropsWithChildren) => <FiltersProvider>{children}</FiltersProvider>;

beforeEach(() => {
  jest.mocked(catalogApi.getCategories).mockResolvedValue([{ id: 1, name: 'Balones', parentId: null }]);
  jest.mocked(catalogApi.getBrands).mockResolvedValue([{ id: 2, name: 'Sport Center', image: '' }]);
  jest.mocked(catalogApi.getSports).mockResolvedValue([{ id: 3, name: 'Fútbol' }]);
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
