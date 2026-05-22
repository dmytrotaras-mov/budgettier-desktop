export default function TestLibraryPage() {
  return (
    <div className="flex-1 overflow-auto pb-20 md:pb-0">
      <div className="p-4 md:p-8 bg-[#f3f4f6]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-gray-900 tracking-tight mb-4 sm:mb-6">
              Guides
            </h1>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[80vh] min-h-[600px] max-h-[1000px]">
            <iframe
              src="https://dmitryeret.notion.site/ebd/26ffdfd7dcbc80a2b8f3c3f25a1ddb9f?v=26ffdfd7dcbc800ca51d000c1c936bfa"
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen
              title="Guides - Knowledge Base and Learning Resources"
              className="w-full h-full"
              data-testid="library-iframe"
            />
          </div>
        </div>
      </div>
    </div>
  );
}