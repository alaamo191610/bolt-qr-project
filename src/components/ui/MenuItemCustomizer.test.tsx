import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuItemCustomizer from './MenuItemCustomizer';
import { menuService } from '../../services/menuService';

vi.mock('../../services/menuService', () => ({
  menuService: { getMenuConfig: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

const baseConfig = {
  menu: { id: '1', name_en: 'Burger', name_ar: null, price: 10, image_url: null },
  ingredients: [],
  modifierGroups: [],
  comboGroups: [],
};

describe('MenuItemCustomizer full customization cycle', () => {
  it('keeps ingredient extra quantity, price, and checkout payload synchronized', async () => {
    vi.mocked(menuService.getMenuConfig).mockResolvedValue({
      ...baseConfig,
      ingredients: [{
        menu_id: '1',
        ingredient_id: '10',
        removable: true,
        extra_available: true,
        max_extra: 3,
        extra_price_override: null,
        ingredient: { id: '10', name_en: 'Cheese', name_ar: null, extra_price: 2 },
      }],
    });
    const onAdd = vi.fn();

    render(<MenuItemCustomizer menuId="1" onAdd={onAdd} />);
    await waitFor(() => expect(screen.getByText('Cheese')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'extra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase extra quantity' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/ }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      priceDelta: 4,
      ingredients: [{ ingredientId: '10', action: 'extra', qty: 2 }],
    }));
  });

  it('supports selecting multiple combo children and includes all price deltas', async () => {
    vi.mocked(menuService.getMenuConfig).mockResolvedValue({
      ...baseConfig,
      comboGroups: [{
        id: '20',
        menu_id: '1',
        min_select: 2,
        max_select: 2,
        combo_group_items: [
          { child_menu_id: '2', is_default: false, upgrade_price_delta: 1, menus: { id: '2', name_en: 'Fries', price: 3 } },
          { child_menu_id: '3', is_default: false, upgrade_price_delta: 2, menus: { id: '3', name_en: 'Salad', price: 4 } },
        ],
      }],
    });
    const onAdd = vi.fn();

    render(<MenuItemCustomizer menuId="1" onAdd={onAdd} />);
    await waitFor(() => expect(screen.getByText('Fries')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Fries/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salad/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/ }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      priceDelta: 3,
      comboChildren: [
        { groupId: '20', childMenuId: '2' },
        { groupId: '20', childMenuId: '3' },
      ],
    }));
  });
});
