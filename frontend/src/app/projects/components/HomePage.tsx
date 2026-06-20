"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ImportProjectModal } from "./ImportProjectModal";
import { ProjectPromptInterface } from "./ProjectPromptInterface";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectsLayout } from "./ProjectsLayout";
import { StyleGallery } from "./StyleGallery";
import { TemplatesSection } from "./TemplatesSection";

export const HomePage = () => {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [selectedTemplate, setSelectedTemplate] = useState("Next.js");
  const [selectedStyle, setSelectedStyle] = useState("Default");
  const [showImportModal, setShowImportModal] = useState(false);

  const handleTemplateSelect = (template: any) => {
    setSelectedTemplate(template.name);
  };

  return (
    <ProjectsLayout>
      <ProjectPromptInterface
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
        selectedStyle={selectedStyle}
        onStyleChange={setSelectedStyle}
      />
      <TemplatesSection
        selectedTemplate={selectedTemplate}
        onTemplateSelect={handleTemplateSelect}
      />
      <StyleGallery
        activeStyle={selectedStyle}
        onStyleChange={setSelectedStyle}
      />
      <div className="mt-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">
              {t("yourProjects")}
            </h2>
            <p className="text-[#666666]">
              {t("manageHint")}
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#faf9f8] border border-[#e5e5e5] text-[#1a1a1a] text-sm font-medium rounded-xl shadow-sm transition-all"
          >
            <Upload className="w-4 h-4" />
            {t("import")}
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
