import { useQueryClient } from '@tanstack/react-query';

export function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['state'] });
    void qc.invalidateQueries({ queryKey: ['changelog'] });
  };
}
