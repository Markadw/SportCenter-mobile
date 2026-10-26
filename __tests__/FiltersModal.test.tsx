import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useFilters } from '../src/features/catalog';
import { FiltersModal } from '../src/features/products/components/FiltersModal';

jest.mock('../src/features/catalog', () => ({ useFilters: jest.fn() }));
jest.mock('lucide-react-native', () => ({ ChevronDown: () => null, ChevronUp: () => null,
  SlidersHorizontal: () => null, X: () => null }));

type PendingAnimation = { finish?: (result: { finished: boolean }) => void; stop: jest.Mock };
let animations: PendingAnimation[];

beforeEach(() => {
  animations = [];
  jest.mocked(useFilters).mockReturnValue({
    filters: { categoryId: null, brandId: null, sportName: null },
    categories: [{ id: 1, name: 'Balones', parentId: null }],
    brands: [], sports: [], activeCount: 0,
    setCategory: jest.fn(), setBrand: jest.fn(), setSport: jest.fn(), clearFilters: jest.fn(),
  });
  jest.spyOn(Animated, 'timing').mockImplementation(() => {
    const pending: PendingAnimation = { stop: jest.fn() };
    animations.push(pending);
    return {
      start: (callback) => { pending.finish = callback ?? undefined; },
      stop: pending.stop,
      reset: jest.fn(),
    };
  });
});

afterEach(() => jest.restoreAllMocks());

test('abre desde oculto y conserva el contenido hasta completar el cierre', async () => {
  const onClose = jest.fn();
  const view = await render(<FiltersModal visible={false} onClose={onClose} />);
  expect(screen.queryByText('Filtros')).toBeNull();
  await view.rerender(<FiltersModal visible onClose={onClose} />);
  expect(screen.getByText('Filtros')).toBeTruthy();
  await view.rerender(<FiltersModal visible={false} onClose={onClose} />);
  expect(screen.getByText('Filtros')).toBeTruthy();
  await act(async () => { animations[animations.length - 1].finish?.({ finished: true }); });
  expect(screen.queryByText('Filtros')).toBeNull();
});

test('reabrir durante el cierre cancela la animación anterior y mantiene los filtros', async () => {
  const onClose = jest.fn();
  const view = await render(<FiltersModal visible onClose={onClose} />);
  await view.rerender(<FiltersModal visible={false} onClose={onClose} />);
  const closing = animations[animations.length - 1];
  await view.rerender(<FiltersModal visible onClose={onClose} />);
  expect(closing.stop).toHaveBeenCalledTimes(1);
  await act(async () => { closing.finish?.({ finished: false }); });
  expect(screen.getByText('Filtros')).toBeTruthy();
});

test('seleccionar, limpiar y aplicar comunica las acciones al contexto y al padre', async () => {
  const onClose = jest.fn();
  await render(<FiltersModal visible onClose={onClose} />);
  await fireEvent.press(screen.getByText('Balones'));
  expect(jest.mocked(useFilters)().setCategory).toHaveBeenCalledWith(1);
  await fireEvent.press(screen.getByText('Limpiar'));
  expect(jest.mocked(useFilters)().clearFilters).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('Aplicar'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
