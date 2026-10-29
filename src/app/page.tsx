import Workspace from '@/components/Workspace';
import { workspaceResponse } from '@/lib/server/workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const data = await workspaceResponse();
  return <Workspace initialData={JSON.parse(JSON.stringify(data))} />;
}
