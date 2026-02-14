import { WorkspaceDashboard } from "../components/WorkspaceDashboard";

interface ContainerPageProps {
  params: Promise<{
    containerId: string;
  }>;
}

export default async function ContainerPage({ params }: ContainerPageProps) {
  const { containerId } = await params;

  return <WorkspaceDashboard containerId={containerId} />;
}
