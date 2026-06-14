"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { ImportProjectModal } from "./ImportProjectModal";
import { ProjectPromptInterface } from "./ProjectPromptInterface";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectsLayout } from "./ProjectsLayout";
import { TemplatesSection } from "./TemplatesSection";

export const ProjectsPage = () => {
  const [selectedTemplate, setSelectedTemplate] = useState("Next.js");
  const [showImportModal, setShowImportModal] = useState(false);

  const handleTemplateSelect = (template: any) => {
    setSelectedTemplate(template.name);
  };

  return (
    <ProjectsLayout>
      <ProjectPromptInterface
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
      />
      <TemplatesSection
        selectedTemplate={selectedTemplate}
        onTemplateSelect={handleTemplateSelect}
      />
      <div className="mt-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Your Projects
            </h2>
            <p className="text-gray-400">
              Manage and access your V1 projects.
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 text-white text-sm font-medium rounded-xl transition-all backdrop-blur-sm"
          >
            <Upload className="w-4 h-4" />
            导入项目
          </button>
        </div>
        <ProjectsGrid />
      </div>

      {showImportModal && (
        <ImportProjectModal onClose={() => setShowImportModal(false)} />
      )}
    </ProjectsLayout>
  );
};
