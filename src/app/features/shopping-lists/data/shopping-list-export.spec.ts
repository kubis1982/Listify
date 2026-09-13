import { ShoppingList } from './shopping-list.model';
import {
  parseShoppingListExport,
  ShoppingListImportError,
  toExportFilename,
  toShoppingListExport,
} from './shopping-list-export';

describe('toShoppingListExport', () => {
  it('builds a version-1 export with the list name and items, dropping id/status/purchased', () => {
    const list: ShoppingList = {
      id: 'list-1',
      name: 'Weekly groceries',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      items: [
        {
          id: 'item-1',
          productName: 'Milk',
          unitLabel: 'l',
          categoryName: 'Dairy',
          quantity: 2,
          purchased: true,
          note: 'organic',
        },
      ],
    };

    const result = toShoppingListExport(list);

    expect(result.version).toBe(1);
    expect(Number.isNaN(Date.parse(result.exportedAt))).toBe(false);
    expect(result.list).toEqual({
      name: 'Weekly groceries',
      items: [
        { productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' },
      ],
    });
  });

  it('omits note when the item has none', () => {
    const list: ShoppingList = {
      id: 'list-1',
      name: 'Weekly groceries',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
      items: [
        { id: 'item-1', productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, purchased: false },
      ],
    };

    const result = toShoppingListExport(list);

    expect(result.list.items[0]).not.toHaveProperty('note');
  });
});

describe('parseShoppingListExport', () => {
  const validJson = JSON.stringify({
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    list: {
      name: 'Weekly groceries',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' }],
    },
  });

  it('parses a well-formed export', () => {
    const result = parseShoppingListExport(validJson);
    expect(result.list.name).toBe('Weekly groceries');
    expect(result.list.items).toEqual([
      { productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' },
    ]);
  });

  it('accepts an item with no note', () => {
    const json = JSON.stringify({
      version: 1,
      list: { name: 'x', items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }] },
    });
    expect(() => parseShoppingListExport(json)).not.toThrow();
  });

  it('throws ShoppingListImportError for invalid JSON', () => {
    expect(() => parseShoppingListExport('not json')).toThrow(ShoppingListImportError);
  });

  it('throws for an unsupported version', () => {
    const json = JSON.stringify({ version: 2, list: { name: 'x', items: [] } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when the list name is missing', () => {
    const json = JSON.stringify({ version: 1, list: { items: [] } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when items is not an array', () => {
    const json = JSON.stringify({ version: 1, list: { name: 'x', items: 'nope' } });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when an item is missing a required field', () => {
    const json = JSON.stringify({
      version: 1,
      list: { name: 'x', items: [{ productName: 'Milk', unitLabel: 'l', quantity: 2 }] },
    });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when an item quantity is zero', () => {
    const json = JSON.stringify({
      version: 1,
      list: {
        name: 'x',
        items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 0 }],
      },
    });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when an item quantity is negative', () => {
    const json = JSON.stringify({
      version: 1,
      list: {
        name: 'x',
        items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: -1 }],
      },
    });
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });

  it('throws when an item quantity parses to Infinity', () => {
    // Written as raw JSON text (not JSON.stringify) because JSON.stringify(Infinity) would
    // serialize to `null` before parsing ever happens. A number literal this large parses
    // to Infinity via JSON.parse, which is exactly the corruption path being guarded against.
    const json = `{
      "version": 1,
      "list": {
        "name": "x",
        "items": [{ "productName": "Milk", "unitLabel": "l", "categoryName": "Dairy", "quantity": 1e400 }]
      }
    }`;
    expect(() => parseShoppingListExport(json)).toThrow(ShoppingListImportError);
  });
});

describe('toExportFilename', () => {
  it('slugifies the list name into a .json filename', () => {
    expect(toExportFilename('Weekly groceries')).toBe('weekly-groceries.json');
  });

  it('falls back to a generic name when the list name has no usable characters', () => {
    expect(toExportFilename('   ')).toBe('shopping-list.json');
    expect(toExportFilename('!!!')).toBe('shopping-list.json');
  });
});
