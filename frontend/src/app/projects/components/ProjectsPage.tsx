"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ImportProjectModal } from "./ImportProjectModal";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectsLayout } from "./ProjectsLayout";

export const ProjectsPage = () => {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <ProjectsLayout>
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-3">
          {t("yourProjects")}
        </h1>
        <p className="text-[#666666]">
          {t("manageHint")}
        </p>
      </div>
      <div className="mb-6">
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#faf9f8] border border-[#e5e5e5] text-[#1a1a1a] text-sm font-medium rounded-xl shadow-sm transition-all"
        >
          <Upload className="w-4 h-4" />
          {t("import")}
        </button>
      </div>
      <ProjectsGrid />

      {showImportModal && (
        <ImportProjectModal onClose={() => setShowImportModal(false)} />
      )}
    </ProjectsLayout>
  );
};
