/**
 * UI preferences stored in localStorage; cleared on logout so the next user
 * on the same browser does not inherit column layouts. Keep in sync with
 * section files that define these keys.
 */
export const PATTEX_UI_STORAGE_KEYS = [
  'pattex.buybox.columnOrder.v1',
  'pattex.buybox.visibleColumns.v1',
  'pattex.revenue.columnOrder.v1',
  'pattex.revenue.visibleColumns.v1',
  'pattex.inventory.columnOrder.v1',
  'pattex.inventory.visibleColumns.v1',
];
