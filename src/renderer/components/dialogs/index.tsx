import { useStore } from '@renderer/state/store';
import { DialogShell } from './DialogShell';
import { MkDirPrompt } from './MkDirPrompt';
import { RenamePrompt } from './RenamePrompt';
import { DeleteConfirm } from './DeleteConfirm';
import { CopyDialog } from './CopyDialog';
import { MoveDialog } from './MoveDialog';
import { OverwritePrompt } from './OverwritePrompt';
import { ProgressDialog } from './ProgressDialog';
import { EditFavoritePrompt } from './EditFavoritePrompt';
import { MultiRename } from './MultiRename';
import { CompareView } from './CompareView';
import type { RenamePreviewRow } from '@renderer/commands/multirename';

type Handlers = {
  onMkdir: (side: 'left' | 'right', name: string) => void;
  onRename: (side: 'left' | 'right', oldName: string, newName: string) => void;
  onDeleteConfirmed: (paths: string[]) => void;
  onCopyConfirmed: (sources: string[], dst: string) => void;
  onMoveConfirmed: (sources: string[], dst: string) => void;
  onOverwriteAnswer: (opId: string, answer: import('@shared/types').ConflictAnswer) => void;
  onCancelOp: (opId: string) => void;
  onFavoriteSaved: (path: string, label: string) => void;
  onFavoriteRemoved: (path: string) => void;
  onMultiRename: (side: 'left' | 'right', dir: string, rows: RenamePreviewRow[]) => void;
};

export function Dialogs(h: Handlers) {
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  if (!dialog) return null;
  const close = () => setDialog(null);

  switch (dialog.kind) {
    case 'mkdir':
      return <DialogShell title="Create folder" onClose={close}>
        <MkDirPrompt onSubmit={(n) => { h.onMkdir(dialog.side, n); close(); }} onCancel={close} />
      </DialogShell>;
    case 'rename':
      return <DialogShell title="Rename" onClose={close}>
        <RenamePrompt oldName={dialog.oldName} onSubmit={(n) => { h.onRename(dialog.side, dialog.oldName, n); close(); }} onCancel={close} />
      </DialogShell>;
    case 'deleteConfirm':
      return <DialogShell title="Permanent delete" onClose={close}>
        <DeleteConfirm paths={dialog.paths} onConfirm={() => { h.onDeleteConfirmed(dialog.paths); close(); }} onCancel={close} />
      </DialogShell>;
    case 'copy':
      return <DialogShell title="Copy" onClose={close}>
        <CopyDialog sources={dialog.sources} dstDefault={dialog.dstDefault} ctaLabel="Copy"
          onSubmit={(dst) => { h.onCopyConfirmed(dialog.sources, dst); close(); }} onCancel={close} />
      </DialogShell>;
    case 'move':
      return <DialogShell title="Move" onClose={close}>
        <MoveDialog sources={dialog.sources} dstDefault={dialog.dstDefault}
          onSubmit={(dst) => { h.onMoveConfirmed(dialog.sources, dst); close(); }} onCancel={close} />
      </DialogShell>;
    case 'overwrite':
      return <DialogShell title="File exists" onClose={() => h.onOverwriteAnswer(dialog.opId, { action: 'cancel' })}>
        <OverwritePrompt srcPath={dialog.srcPath} dstPath={dialog.dstPath}
          onAnswer={(a) => { h.onOverwriteAnswer(dialog.opId, a); close(); }} />
      </DialogShell>;
    case 'progress':
      return <DialogShell title={dialog.title} onClose={() => h.onCancelOp(dialog.opId)}>
        <ProgressDialog title={dialog.title} filesDone={dialog.filesDone} filesTotal={dialog.filesTotal}
          bytesDone={dialog.bytesDone} bytesTotal={dialog.bytesTotal} currentFile={dialog.currentFile}
          onCancel={() => h.onCancelOp(dialog.opId)} />
      </DialogShell>;
    case 'favoriteEdit':
      return <DialogShell title="Edit favorite" onClose={close}>
        <EditFavoritePrompt path={dialog.path} initialLabel={dialog.label}
          onSave={(label) => { h.onFavoriteSaved(dialog.path, label); close(); }}
          onRemove={() => { h.onFavoriteRemoved(dialog.path); close(); }}
          onCancel={close} />
      </DialogShell>;
    case 'multiRename':
      return <DialogShell title={`Multi-rename — ${dialog.names.length} item(s)`} onClose={close} size="wide">
        <MultiRename
          names={dialog.names}
          existingNames={dialog.existingNames}
          onApply={(rows) => { h.onMultiRename(dialog.side, dialog.dir, rows); close(); }}
          onCancel={close} />
      </DialogShell>;
    case 'compare':
      return <DialogShell title="Compare by content" onClose={close} size="wide">
        <CompareView left={dialog.left} right={dialog.right} onClose={close} />
      </DialogShell>;
  }
}
