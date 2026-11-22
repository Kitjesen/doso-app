import { draftError, type TaskDraft } from '../features/tasks/draft';
import { localStore } from './localStore';

type Storage = Pick<typeof localStore, 'getItem' | 'setItem'>;

function parse(value: unknown): TaskDraft {
  if (!value || typeof value !== 'object') throw new Error('草稿格式不可用');
  const draft = value as TaskDraft;
  if (['name', 'route', 'date', 'time'].some(key => typeof (value as Record<string, unknown>)[key] !== 'string')
    || typeof draft.photo !== 'boolean' || typeof draft.pause !== 'boolean'
    || !['wait', 'return'].includes(draft.finish) || draftError(draft)) throw new Error('草稿格式不可用');
  return draft;
}

export function createTaskDraftStore(storage: Storage) {
  let writes: Promise<void> = Promise.resolve();
  const key = (scope: string) => {
    if (!scope || scope.length > 256) throw new Error('未选择草稿所属设备');
    return 'doso.task-draft.v1.' + Array.from(scope, char => char.codePointAt(0)!.toString(16)).join('-');
  };
  return {
    async load(scope: string): Promise<TaskDraft | null> {
      await writes.catch(() => undefined);
      const value = await storage.getItem(key(scope));
      return value === null ? null : parse(JSON.parse(value));
    },
    save(scope: string, draft: TaskDraft) {
      const name = key(scope), value = JSON.stringify(parse(draft));
      const result = writes.catch(() => undefined).then(() => storage.setItem(name, value));
      writes = result;
      return result;
    },
  };
}

export const taskDraftStore = createTaskDraftStore(localStore);
