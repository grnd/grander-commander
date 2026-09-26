import { useEffect, useRef } from 'react';
import { useStore } from '@renderer/state/store';
import { closeEditor, saveEditor } from '@renderer/commands/editor';

export function Editor() {
  const editor = useStore((s) => s.editor);
  const setEditor = useStore((s) => s.setEditor);
  const setDialog = useStore((s) => s.setDialog);
  const update = useStore((s) => s.updateEditorContent);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Focus follows the file, so opening a second file does not leave the caret
  // in the previous buffer's textarea.
  useEffect(() => { taRef.current?.focus(); }, [editor?.path]);

  if (!editor) return null;
  const dirty = editor.current !== editor.original;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The dirty-close prompt owns the keyboard while it is up.
    if (useStore.getState().dialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor(editor, setEditor, setDialog);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveEditor(editor, window.gc.fs.writeTextFile, setEditor, (m) => alert(m));
    }
  };

  return (
    <div className="gc-editor" onKeyDown={onKeyDown} data-testid="gc-editor">
      <div className="gc-editor-header">
        <span className="gc-editor-mode">Edit</span>
        <span className="gc-editor-path">{editor.path}</span>
        {dirty && <span className="gc-editor-badge is-dirty">● modified</span>}
        <span className="gc-editor-hint">Cmd/Ctrl+S: save · Esc: close</span>
      </div>
      <div className="gc-editor-body">
        <textarea
          ref={taRef}
          className="gc-editor-textarea"
          value={editor.current}
          onChange={(e) => update(e.target.value)}
          spellCheck={false}
          aria-label={`Editing ${editor.path}`}
        />
      </div>
    </div>
  );
}
