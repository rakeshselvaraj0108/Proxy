import { AnalysisDetailById } from "@/components/proxy-v2/Pages";

type PageProps = { params: Promise<{ id: string }> };
export default async function Page({ params }: PageProps) { const { id } = await params; return <AnalysisDetailById id={id} />; }
