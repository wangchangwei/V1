"use client";

import { useState } from "react";
import { ProjectPromptInterface } from "./ProjectPromptInterface";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectsLayout } from "./ProjectsLayout";
import { TemplatesSection } from "./TemplatesSection";

export const ProjectsPage = () => {
  const [selectedTemplate, setSelectedTemplate] = useState("Next.js");

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
              Manage and access your December projects.
            </p>
          </div>
        </div>
        <ProjectsGrid />
      </div>
    </ProjectsLayout>
  );
};
