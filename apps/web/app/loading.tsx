export default function Loading() {
  return (
    <div className="skeleton-page" aria-busy>
      <div className="skeleton" style={{ height: 28, width: "38%" }} />
      <div className="skeleton" style={{ height: 16, width: "62%" }} />
      <div className="grid" style={{ marginTop: 12 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="skeleton" style={{ height: 150 }} />
        ))}
      </div>
    </div>
  );
}
