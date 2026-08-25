export default function LoadingSpinner({ fullScreen = false }) {
  const inner = (
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="Loading"
          className="w-8 h-8 object-contain animate-pulse"
        />
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex justify-center py-16">
      {inner}
    </div>
  );
}