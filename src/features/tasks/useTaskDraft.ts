import { useEffect, useMemo, useRef, useState } from 'react';
import { taskDraftStore } from '../../services/taskDraft';
import type { TaskDraft } from './draft';

export function useTaskDraft(scope?: string) {
  const owner = useMemo(() => ({ scope }), [scope]);
  const current = useRef(owner);
  current.current = owner;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ owner: object; draft: TaskDraft | null; error: string | null } | null>(null);
  const view = loaded?.owner === owner ? loaded : null;
  useEffect(() => {
    let active = true;
    setLoaded(null);
    if (!scope) { setLoaded({ owner, draft: null, error: null }); return; }
    void taskDraftStore.load(scope).then(draft => {
      if (active) setLoaded({ owner, draft, error: null });
    }, () => {
      if (active) setLoaded({ owner, draft: null, error: '草稿读取失败，请重试' });
    });
    return () => { active = false; };
  }, [owner, attempt]);
  const save = async (draft: TaskDraft) => {
    if (current.current !== owner) throw new Error('设备已切换，请重新打开草稿');
    if (scope) await taskDraftStore.save(scope, draft);
    if (current.current === owner) setLoaded({ owner, draft, error: null });
  };
  return { draft: view?.draft ?? null, loading: view === null, error: view?.error ?? null, save,
    retry: () => setAttempt(value => value + 1) };
}
