import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ChangeTable } from '../components/ChangeTable';

export default function ChangeLog() {
  const { data, isLoading } = useQuery({ queryKey: ['changelog'], queryFn: () => api.changelog() });
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Change log</h2>
      {isLoading ? <p className="text-slate-500">Loading...</p> : <ChangeTable rows={data ?? []} showFeature />}
    </div>
  );
}
