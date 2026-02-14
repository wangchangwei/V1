export const CryptoPlaceholder = () => {
  return (
    <div className="flex-1 bg-gray-950 p-6">
      <div className="h-full w-full bg-gray-900 rounded-lg border border-gray-800 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-blue-500 rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">
            Crypto Dashboard
          </h1>
          <p className="text-gray-400 text-lg mb-6">
            Your crypto trading interface will be rendered here
          </p>
          <div className="text-sm text-gray-500 space-y-2">
            <p>• Real-time market data</p>
            <p>• Interactive trading charts</p>
            <p>• Portfolio management</p>
            <p>• Price alerts & notifications</p>
          </div>
        </div>
      </div>
    </div>
  );
};
