import { buildShoppingList } from '../../../testing/in-memory-shopping-lists-store';
import { shoppingListFromFirestore, shoppingListToFirestore } from './shopping-list-firestore';

describe('shopping list Firestore mapping', () => {
  const milk = {
    id: 'item-a',
    productName: 'Milk',
    unitLabel: 'l',
    categoryName: 'Dairy',
    quantity: 2,
    purchased: false,
  };

  it('stores items as a map keyed by item id', () => {
    const stored = shoppingListToFirestore(buildShoppingList({ items: [milk] }));

    expect(stored['items']).toEqual({ 'item-a': milk });
  });

  it('round-trips a list', () => {
    const list = buildShoppingList({ items: [milk] });

    expect(shoppingListFromFirestore(shoppingListToFirestore(list), list.id)).toEqual(list);
  });

  it('takes item ids from the map keys', () => {
    const list = shoppingListFromFirestore(
      { ...shoppingListToFirestore(buildShoppingList()), items: { 'item-z': { ...milk, id: 'stale' } } },
      'list-1',
    );

    expect(list.items.map((item) => item.id)).toEqual(['item-z']);
  });

  it('drops malformed items and keeps valid ones', () => {
    const base = shoppingListToFirestore(buildShoppingList());
    const list = shoppingListFromFirestore(
      {
        ...base,
        items: {
          'item-a': milk,
          'not-object': 'oops',
          'null-item': null,
          'no-name': { ...milk, productName: undefined },
          'bad-quantity': { ...milk, quantity: Number.NaN },
          'bad-purchased': { ...milk, purchased: 'yes' },
          'bad-note': { ...milk, note: 5 },
        },
      },
      'list-1',
    );

    expect(list.items.map((item) => item.id)).toEqual(['item-a']);
  });
});
