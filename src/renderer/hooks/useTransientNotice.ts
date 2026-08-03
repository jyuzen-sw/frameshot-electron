import { useCallback, useEffect, useState } from 'react';

export type TransientNotice = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

interface TransientNoticeState {
  notice: TransientNotice | null;
  showNotice: (notice: TransientNotice) => void;
  dismissNotice: () => void;
}

interface UseTransientNoticeOptions {
  paused?: boolean;
}

export function useTransientNotice({
  paused = false,
}: UseTransientNoticeOptions = {}): TransientNoticeState {
  const [notice, setNotice] = useState<TransientNotice | null>(null);

  const showNotice = useCallback((nextNotice: TransientNotice) => {
    setNotice(nextNotice);
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!notice || paused) return;
    const timeout = window.setTimeout(
      dismissNotice,
      notice.kind === 'error' ? 7_000 : 3_600,
    );
    return () => window.clearTimeout(timeout);
  }, [dismissNotice, notice, paused]);

  return { notice, showNotice, dismissNotice };
}
