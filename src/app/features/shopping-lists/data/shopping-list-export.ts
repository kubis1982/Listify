import { ShoppingList } from './shopping-list.model';

export interface ShoppingListExportItem {
  productName: string;
  unitLabel: string;
  categoryName: string;
  quantity: number;
  note?: string;
}

export interface ShoppingListExport {
  version: 1;
  exportedAt: string;
  list: {
    name: string;
    items: ShoppingListExportItem[];
  };
}

export class ShoppingListImportError extends Error {
  constructor() {
    super("Invalid shopping list export file");
    this.name = 'ShoppingListImportError';
  }
}

export function toShoppingListExport(list: ShoppingList): ShoppingListExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    list: {
      name: list.name,
      items: list.items.map((item) => ({
        productName: item.productName,
        unitLabel: item.unitLabel,
        categoryName: item.categoryName,
        quantity: item.quantity,
        ...(item.note ? { note: item.note } : {}),
      })),
    },
  };
}

export function parseShoppingListExport(raw: string): ShoppingListExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShoppingListImportError();
  }
  if (!isValidExport(parsed)) {
    throw new ShoppingListImportError();
  }
  return parsed;
}

export function toExportFilename(listName: string): string {
  const slug = listName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'shopping-list'}.json`;
}

function isValidExport(value: unknown): value is ShoppingListExport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== 1) {
    return false;
  }
  const list = candidate['list'];
  if (typeof list !== 'object' || list === null) {
    return false;
  }
  const listCandidate = list as Record<string, unknown>;
  if (typeof listCandidate['name'] !== 'string' || listCandidate['name'].trim() === '') {
    return false;
  }
  const items = listCandidate['items'];
  return Array.isArray(items) && items.every(isValidExportItem);
}

function isValidExportItem(value: unknown): value is ShoppingListExportItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item['productName'] === 'string' &&
    typeof item['unitLabel'] === 'string' &&
    typeof item['categoryName'] === 'string' &&
    typeof item['quantity'] === 'number' &&
    Number.isFinite(item['quantity']) &&
    item['quantity'] > 0 &&
    (item['note'] === undefined || typeof item['note'] === 'string')
  );
}
