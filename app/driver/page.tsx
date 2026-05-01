// Bare /driver entry — the real driver app lives at /driver/[locationId].
// Each lot is configured to bookmark its own /driver/<location-uuid> URL,
// so this page only renders when someone hits /driver directly.
export default function DriverIndex() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="text-[20px] font-semibold mb-2" style={{ color: '#E8E6E0' }}>
          This device isn&rsquo;t set up
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: '#9b9a94' }}>
          The driver app needs to be opened from the URL printed for this lot.
          Ask your manager for the device link, or scan the QR code on the lot
          tablet.
        </p>
      </div>
    </div>
  );
}
