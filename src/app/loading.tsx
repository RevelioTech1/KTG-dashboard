export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] animate-pulse px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="bg-secondary h-4 w-40 rounded" />
      <div className="bg-secondary mt-3 h-8 w-96 rounded" />
      <div className="bg-secondary mt-3 h-4 w-full max-w-3xl rounded" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card h-36 rounded-xl border" />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="bg-card h-96 rounded-xl border lg:col-span-3" />
        <div className="bg-card h-96 rounded-xl border lg:col-span-2" />
      </div>
    </div>
  );
}
