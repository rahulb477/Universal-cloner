import Workspace from "@/components/studio/Workspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return <Workspace id={(await params).id} />;
}
