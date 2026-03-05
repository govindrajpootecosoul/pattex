import express from 'express';
import Inventory from '../models/Inventory.js';
import Revenue from '../models/Revenue.js';

const router = express.Router();

function parseNum(val) {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// Static data for dashboard sections (as per requirements)
const executiveSummary = {
  title: 'Executive Summary',
  dataUpdated: new Date().toISOString().split('T')[0],
  kpis: [
    { metric: 'Overall Revenue', target: 25000, actualBTL: 23500, actualMTD: 24200, variation: '-3.2%' },
    { metric: 'Overall Spend', target: 12000, actualBTL: 11800, actualMTD: 11500, variation: '+2.5%' },
  ],
  metrics: [
    { label: 'PO Received', value: 3000 },
    { label: 'Open PO', value: 2000 },
    { label: 'Scheduled PO', value: 1000 },
    { label: 'SBU MTD Batch', value: 12 },
  ],
};

const buybox = {
  title: 'Buybox',
  comingSoon: true,
  message: 'Buybox section – coming soon. VC and S. Auction, Buybox, Top of search data will be available here.',
};

const marketing = {
  title: 'Marketing',
  comingSoon: true,
  message: 'Marketing section – coming soon.',
};

const productDetails = {
  title: 'Product Details',
  comingSoon: true,
  message: 'Product Details section – coming soon. Deep dive ASIN performance, last 30 days sales will be available here.',
};

// All dashboard routes return data; protected by auth
router.get('/executive-summary', (req, res) => res.json(executiveSummary));
router.get('/revenue', async (req, res) => {
  try {
    const docs = await Revenue.find({}).lean();
    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const adUnits = parseNum(doc.ads_unit_sold);
      const adRevenue = parseNum(doc.ads_sales);
      const organicRevenue = parseNum(doc.organic_sale);
      const organicUnits = Math.max(0, totalUnits - adUnits);
      const aov = totalUnits > 0 ? totalSales / totalUnits : 0;
      const tacos = totalSales > 0 ? (parseNum(doc.ads_spend) / totalSales) * 100 : 0;
      const dateStr = doc.Date != null ? String(doc.Date) : '';
      const reportMonth = dateStr ? dateStr.slice(0, 7) : '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN ?? '',
        productName: doc['Product Name'] ?? '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
        salesChannel: doc['Sales Channel'] ?? '',
        reportMonth,
        overallUnit: totalUnits,
        overallRevenue: totalSales,
        adUnit: adUnits,
        adRevenue,
        organicUnit: organicUnits,
        organicRevenue,
        newToBrandUnit: 0,
        repeatUnit: 0,
        promotionalUnit: 0,
        aov,
        tacos,
      };
    });

    res.json({
      title: 'Revenue',
      rows,
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({ message: 'Failed to fetch revenue data' });
  }
});
router.get('/inventory', async (req, res) => {
  try {
    const docs = await Inventory.find({}).lean();

    const rows = docs.map((doc, index) => {
      const availableInventory = Number(doc['Available Inventory'] ?? 0);
      const last30DaysSales = Number(doc.total_sales ?? 0);
      const dos = Number(doc.DOS ?? 0);
      const instockRate = Number(doc['Instock Rate'] ?? 0);
      const openPos = Number(doc['Open POs'] ?? 0);
      const noLowStockWithOpenPos = Number(doc['No/Low Stock wt Open POs'] ?? 0);
      const noLowStockNoOpenPos = Number(doc['No/Low Stock wt no Open POs'] ?? 0);
      const stockStatus = doc.Stock_Status || '';
      const salesChannel = doc['Sales Channel'] || '';
      const date = doc.Date || '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN || '',
        productName: doc['Product Name'] || '',
        category: doc['Product Category'] || doc['Product Sub Category'] || 'UNKNOWN',
        packSize: doc.Pack_Size || '',
        channel: salesChannel,
        available: availableInventory,
        last30DaysSales,
        dos,
        instockRate,
        openPos,
        oosDate: date,
        status: stockStatus,
        noLowStockWithOpenPos,
        noLowStockNoOpenPos,
        isLowStock:
          stockStatus === 'Low Stock' ||
          stockStatus === 'Critical' ||
          stockStatus.toLowerCase().includes('low stock'),
        hasOpenPo: openPos > 0,
        reportMonth: date ? String(date).slice(0, 7) : '',
      };
    });

    res.json({
      title: 'Inventory',
      rows,
    });
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    res.status(500).json({ message: 'Failed to fetch inventory data' });
  }
});
router.get('/buybox', (req, res) => res.json(buybox));
router.get('/marketing', (req, res) => res.json(marketing));
router.get('/product-details', (req, res) => res.json(productDetails));

// Single endpoint that returns all sections (optional); revenue from GET /revenue
router.get('/', (req, res) => {
  res.json({
    executiveSummary,
    buybox,
    marketing,
    productDetails,
  });
});

export default router;
