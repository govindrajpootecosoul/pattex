import React from 'react';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  if (!total || total <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 10)));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  const handlePageSizeChange = (e) => {
    const nextSize = Number(e.target.value) || 10;
    onPageSizeChange(nextSize);
  };

  return (
    <div
      className="table-pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        fontSize: '0.875rem',
        marginTop: '0.75rem',
      }}
    >
      <div
        className="table-pagination-info"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
      >
        <span className="table-pagination-text">
          Showing {from} to {to} of {total} items
        </span>
        <span className="table-pagination-label">Items per page</span>
        <select
          value={pageSize}
          onChange={handlePageSizeChange}
          className="table-pagination-select"
          aria-label="Items per page"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div
        className="table-pagination-nav"
        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
      >
        <button
          type="button"
          className="table-pagination-btn"
          onClick={handlePrev}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          Previous
        </button>
        <button
          type="button"
          className="table-pagination-btn"
          onClick={handleNext}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}

