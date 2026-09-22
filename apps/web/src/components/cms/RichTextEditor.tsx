import { useCallback, useEffect, useRef } from 'react';

/**
 * Rich text editor.
 *
 * Built on `contenteditable` with `document.execCommand` rather than pulling in
 * a large editor framework. The reasoning: the CMS needs bold, italic, lists,
 * headings and links - and the server re-sanitises everything on write anyway,
 * so whatever markup the editor produces is normalised to the allow-list before
 * storage. A 200 KB editor dependency would not change what can be saved.
 *
 * `execCommand` is formally deprecated but is still implemented in every
 * browser and has no standardised replacement; the alternative is an editor
 * library. If richer editing is needed later, this component is the single
 * swap point - its contract is just `value` and `onChange`.
 *
 * SECURITY: nothing here is trusted. The value is sanitised server-side on
 * every write, so a user pasting markup or editing the DOM cannot store
 * anything the allow-list forbids.
 */

export interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (html: string) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface ToolbarAction {
  label: string;
  title: string;
  command: string;
  argument?: string;
}

const TOOLBAR: readonly ToolbarAction[] = [
  { label: 'B', title: 'Bold', command: 'bold' },
  { label: 'I', title: 'Italic', command: 'italic' },
  { label: 'H2', title: 'Heading', command: 'formatBlock', argument: 'h2' },
  { label: 'H3', title: 'Subheading', command: 'formatBlock', argument: 'h3' },
  { label: '¶', title: 'Paragraph', command: 'formatBlock', argument: 'p' },
  { label: '• List', title: 'Bulleted list', command: 'insertUnorderedList' },
  { label: '1. List', title: 'Numbered list', command: 'insertOrderedList' },
  { label: '❝', title: 'Quote', command: 'formatBlock', argument: 'blockquote' },
];

export function RichTextEditor({
  id,
  value,
  onChange,
  label,
  hint,
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Only write into the DOM when the incoming value differs from what is
  // already there: assigning innerHTML on every render would collapse the
  // caret to the start on each keystroke.
  useEffect(() => {
    const element = editorRef.current;
    if (element && element.innerHTML !== value) {
      element.innerHTML = value;
    }
  }, [value]);

  const exec = useCallback(
    (action: ToolbarAction) => {
      if (disabled) return;

      editorRef.current?.focus();
      document.execCommand(action.command, false, action.argument);
      onChange(editorRef.current?.innerHTML ?? '');
    },
    [disabled, onChange],
  );

  const insertLink = useCallback(() => {
    if (disabled) return;

    const url = window.prompt('Link URL (must start with https://)');
    if (!url) return;

    // Checked here for immediate feedback; the server validates again on save.
    if (!/^https?:\/\//i.test(url)) {
      window.alert('Links must start with http:// or https://');
      return;
    }

    editorRef.current?.focus();
    document.execCommand('createLink', false, url);
    onChange(editorRef.current?.innerHTML ?? '');
  }, [disabled, onChange]);

  return (
    <div className="rich-editor">
      <label className="cms-field__label" htmlFor={id}>
        {label}
      </label>

      <div className="rich-editor__toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {TOOLBAR.map((action) => (
          <button
            key={action.title}
            type="button"
            className="rich-editor__button"
            title={action.title}
            aria-label={action.title}
            disabled={disabled}
            // Mousedown rather than click: clicking would blur the editor and
            // lose the selection the command needs to act on.
            onMouseDown={(event) => {
              event.preventDefault();
              exec(action);
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="rich-editor__button"
          title="Insert link"
          aria-label="Insert link"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            insertLink();
          }}
        >
          🔗
        </button>
      </div>

      <div
        id={id}
        ref={editorRef}
        className="rich-editor__surface rich-text"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onChange(event.currentTarget.innerHTML)}
        onPaste={(event) => {
          // Paste as plain text: pasting from a word processor otherwise
          // carries a mass of markup the sanitiser would strip anyway, and the
          // intermediate state looks broken to the editor.
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />

      {hint ? (
        <p className="cms-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
