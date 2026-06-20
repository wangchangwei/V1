"use client";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "template";
  gradient?: string;
}

interface TemplatesSectionProps {
  selectedTemplate: string;
  onTemplateSelect: (template: Template) => void;
}

export const TemplatesSection = ({
  selectedTemplate,
  onTemplateSelect,
}: TemplatesSectionProps) => {
  const templates: Template[] = [
    {
      id: "nextjs",
      name: "Next.js",
      description: "Build full-stack React apps with Next.js",
      icon: "/nextjs-logo.png",
      category: "template",
      gradient: "from-black to-gray-800",
    },
    {
      id: "express-react",
      name: "Express & React",
      description: "Node.js backend with React frontend",
      icon: "/express-logo.png",
      category: "template",
      gradient: "from-gray-700 to-gray-900",
    },
    {
      id: "express-vue",
      name: "Express & Vue",
      description: "Node.js backend with Vue.js frontend",
      icon: "/vue-logo.png",
      category: "template",
      gradient: "from-green-600 to-emerald-800",
    },
    {
      id: "django",
      name: "Django",
      description: "High-level Python web framework",
      icon: "/django-logo.png",
      category: "template",
      gradient: "from-blue-600 to-indigo-800",
    },
  ];

  const handleTemplateSelect = (template: Template) => {
    onTemplateSelect(template);
  };

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">Templates</h2>
          <p className="text-[#666666]">
            Get started instantly with popular frameworks and tools.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => handleTemplateSelect(template)}
            className={`group relative bg-white hover:bg-[#faf9f8] border rounded-xl p-4 transition-all duration-300 shadow-sm cursor-pointer text-left ${
              selectedTemplate === template.name
                ? "border-[#1a1a1a] ring-1 ring-[#1a1a1a]"
                : "border-[#e5e5e5] hover:border-[#cccccc]"
            }`}
          >
            <div className="flex flex-col">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm overflow-hidden bg-[#faf9f8] border border-[#e5e5e5] mb-3">
                {template.icon.startsWith("/") ? (
                  <img
                    src={template.icon}
                    alt={template.name}
                    className="w-8 h-8 object-contain"
                  />
                ) : (
                  <span className="text-lg font-bold text-[#1a1a1a]">
                    {template.icon}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#1a1a1a] font-semibold mb-1 group-hover:text-black transition-colors">
                  {template.name}
                </h3>
                <p className="text-[#666666] text-sm group-hover:text-[#444444] transition-colors">
                  {template.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
