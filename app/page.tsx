import Workspace from '@/components/workspace';
import WorkspaceLogin from '@/components/workspace-login';
export default function Page(){return process.env.HQ_STAGING_DEMO==='true'?<WorkspaceLogin preview/>:<Workspace/>;}
