import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { productsApi } from '../src/api/productsApi';
import { ProductsProvider, useProducts } from '../src/features/products/context/ProductsContext';
import { product } from './fixtures/products';

jest.mock('../src/api/productsApi', () => ({ productsApi: { getAll: jest.fn() } }));
const getAll = jest.mocked(productsApi.getAll);
const wrapper = ({ children }: PropsWithChildren) => <ProductsProvider>{children}</ProductsProvider>;

describe('HU-03: estados y recuperación del catálogo', () => {
  test('carga los productos y permite localizar un ID', async () => {
    getAll.mockResolvedValueOnce([product]);
    const { result } = await renderHook(() => useProducts(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.getById(7)).toEqual(product);
    expect(result.current.getById(404)).toBeUndefined();
  });

  test('informa el error inicial y recupera el catálogo al reintentar', async () => {
    getAll.mockRejectedValueOnce(new Error('Sin conexión'));
    const { result } = await renderHook(() => useProducts(), { wrapper });
    expect(result.current.error).toBe('Sin conexión');
    expect(result.current.isLoading).toBe(false);
    getAll.mockResolvedValueOnce([product]);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.products).toEqual([product]);
    expect(result.current.error).toBeNull();
  });

  test('conserva los productos cargados si falla una actualización', async () => {
    getAll.mockResolvedValueOnce([product]);
    const { result } = await renderHook(() => useProducts(), { wrapper });
    getAll.mockRejectedValueOnce(new Error('Servidor no disponible'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.products).toEqual([product]);
    expect(result.current.error).toBe('Servidor no disponible');
    expect(result.current.isLoading).toBe(false);
  });
});
