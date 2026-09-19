export const en = {
  'common.add': 'Add',
  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.decreaseQuantity': 'Decrease quantity',
  'common.delete': 'Delete',
  'common.increaseQuantity': 'Increase quantity',
  'common.name': 'Name',
  'common.nameRequired': 'Name is required.',
  'common.quantity': 'Quantity',
  'common.quantityInvalid': 'Quantity must be greater than 0.',
  'common.save': 'Save',

  'language.label': 'Language',
  'language.en': 'English',
  'language.pl': 'Polish',

  'nav.label': 'Main navigation',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',
  'nav.lists': 'Shopping lists',
  'nav.products': 'Products',
  'nav.units': 'Units',
  'nav.categories': 'Categories',

  'picker.hint': 'Start typing to search products.',
  'picker.results': 'Product search results',
  'picker.createOption': 'Create product "{name}"',

  'productDialog.title': 'Create product',
} as const;

export type TranslationKey = keyof typeof en;
