import { useState, useEffect } from 'react';
import { dashboardApi } from '../../api/api';

export default function ProductDetails() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getProductDetails()
      .then(setData)
      .catch(() => setData({ title: 'Product Details', comingSoon: true, message: 'Product Details – coming soon. Deep dive ASIN performance, last 30 days sales will be available here.' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="section-muted">Loading...</div>;

  return (
    <>
      <h2 className="section-title">{data?.title || 'Product Details'}</h2>
      <div className="card coming-soon">
        <h3>Coming soon</h3>
        <p>{data?.message || 'Product Details section – coming soon. Deep dive ASIN performance, last 30 days sales will be available here.'}</p>
      </div>
    </>
  );
}
