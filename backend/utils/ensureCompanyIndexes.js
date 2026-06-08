/**
 * Recommended compound indexes for dashboard date + channel filters.
 * Run once per company DB when ENSURE_COMPANY_INDEXES=true in backend/.env
 */
export async function ensureCompanyIndexes(companyModels) {
  if (!companyModels) return;
  const indexPairs = [
    [companyModels.Revenue, { Date: 1, 'Sales Channel': 1 }],
    [companyModels.Revenue, { date: 1, salesChannel: 1 }],
    [companyModels.Inventory, { Date: 1, 'Sales Channel': 1 }],
    [companyModels.Buybox, { Date: 1, 'Sales Channel': 1 }],
    [companyModels.Marketing, { Date: 1, 'Sales Channel': 1 }],
  ];

  for (const [Model, spec] of indexPairs) {
    if (!Model?.collection) continue;
    try {
      await Model.collection.createIndex(spec, { background: true, name: `pattex_${Object.keys(spec).join('_')}` });
    } catch (_) {
      /* index may already exist or field names differ per tenant */
    }
  }
}
