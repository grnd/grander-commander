import { useEffect, useRef } from 'react';
import { useStore } from '@renderer/state/store';
import { closeEditor, saveEditor } from '@renderer/commands/editor';
import { registerSurface } from '@renderer/keys/surfaces';

export function Editor() {
  const editor = useStore((s) => s.editor);
  const setEditor = useStore((s) => s.setEditor);
  const setDialog = useStore((s) => s.setDialog);
  const update = useStore((s) => s.updateEditorContent);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Focus follows the file, so opening a second file does not leave the caret
  // in the previous buffer's textarea.
  useEffect(() => { taRef.current?.focus(); }, [editor?.path]);

  // Save and close are commands the router dispatches, so a menu item or a
  // button can reach them too. The router consumes the keystroke it acts on,
  // which is what keeps DialogShell's own Escape listener — registered in a
  // layout effect while the opening keypress is still in flight — from
  // dismissing the dirty-close prompt that keypress just raised.
  useEffect(() => {
    if (!editor) return;
    return registerSurface('editor', {
      editorSave: () => void saveEditor(editor, window.gc.fs.writeTextFile, setEditor, (m) => alert(m)),
      editorClose: () => closeEditor(editor, setEditor, setDialog),
    });
  }, [editor, setEditor, setDialog]);

  if (!editor) return null;
  const dirty = editor.current !== editor.original;

  return (
    <div className="gc-editor" data-testid="gc-editor">
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
