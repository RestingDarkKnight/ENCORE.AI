// GuidedCase.jsx — legacy route. The 6-agent workflow now lives inline on
// /roles/:id. Any bookmark to /roles/:id/cases/new-guided is bounced back
// to the role page.
import { Navigate, useParams } from "react-router-dom";

export default function GuidedCase() {
  const { roleId } = useParams();
  return <Navigate to={`/roles/${roleId}`} replace />;
}
