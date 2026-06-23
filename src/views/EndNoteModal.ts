import { App, Modal, setIcon } from 'obsidian';

interface ToolbarAction {
	icon: string;
	label: string;
	action: () => void;
}

export class EndNoteModal extends Modal {
	private initial: string;
	private onSave: (note: string) => void;
	private textarea: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		title: string,
		initial: string,
		onSave: (note: string) => void,
	) {
		super(app);
		this.titleEl.setText(title);
		this.initial = initial;
		this.onSave = onSave;
	}

	onOpen(): void {
		this.modalEl.addClass('archery-end-note-modal-container');
		const { contentEl } = this;
		contentEl.addClass('archery-end-note-modal');

		contentEl.createDiv({
			cls: 'archery-end-note-hint',
			text: 'Markdown supported. Leave empty to remove the note.',
		});

		const editor = contentEl.createDiv({ cls: 'archery-end-note-editor' });
		this.renderToolbar(editor.createDiv({ cls: 'archery-end-note-toolbar' }));
		this.textarea = editor.createEl('textarea', {
			cls: 'archery-end-note-textarea',
			attr: { rows: '12', spellcheck: 'true' },
		});
		this.textarea.value = this.initial;
		this.textarea.addEventListener('keydown', (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault();
				this.save();
			}
		});

		const actions = contentEl.createDiv({ cls: 'archery-end-note-actions' });
		actions.createEl('button', { text: 'Cancel', cls: 'mod-warning' }).addEventListener('click', () => {
			this.close();
		});
		actions.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', () => {
			this.save();
		});

		requestAnimationFrame(() => {
			this.textarea?.focus();
			const length = this.textarea?.value.length ?? 0;
			this.textarea?.setSelectionRange(length, length);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderToolbar(parent: HTMLElement): void {
		const actions: ToolbarAction[] = [
			{ icon: 'bold', label: 'Bold', action: () => this.wrapSelection('**', '**', 'bold') },
			{ icon: 'italic', label: 'Italic', action: () => this.wrapSelection('*', '*', 'italic') },
			{ icon: 'strikethrough', label: 'Strikethrough', action: () => this.wrapSelection('~~', '~~', 'text') },
			{ icon: 'heading', label: 'Heading', action: () => this.toggleLinePrefix('## ') },
			{ icon: 'list', label: 'Bullet list', action: () => this.toggleLinePrefix('- ') },
			{ icon: 'list-ordered', label: 'Numbered list', action: () => this.toggleNumberedList() },
			{ icon: 'quote-glyph', label: 'Quote', action: () => this.toggleLinePrefix('> ') },
			{ icon: 'link', label: 'Link', action: () => this.wrapSelection('[', '](url)', 'text') },
			{ icon: 'code-glyph', label: 'Inline code', action: () => this.wrapSelection('`', '`', 'code') },
			{ icon: 'code', label: 'Code block', action: () => this.wrapSelection('```\n', '\n```', 'code') },
		];

		for (const { icon, label, action } of actions) {
			const button = parent.createEl('button', {
				cls: 'archery-end-note-toolbar-btn',
				attr: { type: 'button', 'aria-label': label },
			});
			setIcon(button.createSpan({ cls: 'archery-end-note-toolbar-icon' }), icon);
			button.addEventListener('click', (event) => {
				event.preventDefault();
				action();
			});
		}
	}

	private wrapSelection(prefix: string, suffix: string, placeholder: string): void {
		const textarea = this.textarea;
		if (!textarea) return;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = textarea.value.slice(start, end) || placeholder;
		const before = textarea.value.slice(0, start);
		const after = textarea.value.slice(end);
		textarea.value = `${before}${prefix}${selected}${suffix}${after}`;

		const selectionStart = start + prefix.length;
		const selectionEnd = selectionStart + selected.length;
		textarea.setSelectionRange(selectionStart, selectionEnd);
		textarea.focus();
	}

	private toggleLinePrefix(prefix: string): void {
		const textarea = this.textarea;
		if (!textarea) return;

		const { lineStart, lineEnd } = this.selectedLineRange(textarea);
		const block = textarea.value.slice(lineStart, lineEnd);
		const lines = block.split('\n');
		const allPrefixed = lines.every((line) => line.startsWith(prefix));
		const nextLines = lines.map((line) =>
			allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`,
		);
		const nextBlock = nextLines.join('\n');
		textarea.value = `${textarea.value.slice(0, lineStart)}${nextBlock}${textarea.value.slice(lineEnd)}`;
		textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
		textarea.focus();
	}

	private toggleNumberedList(): void {
		const textarea = this.textarea;
		if (!textarea) return;

		const { lineStart, lineEnd } = this.selectedLineRange(textarea);
		const block = textarea.value.slice(lineStart, lineEnd);
		const lines = block.split('\n');
		const numberedPattern = /^\d+\.\s/;
		const allNumbered = lines.every((line) => numberedPattern.test(line));
		const nextLines = lines.map((line, index) => {
			if (allNumbered) {
				return line.replace(numberedPattern, '');
			}
			return `${index + 1}. ${line}`;
		});
		const nextBlock = nextLines.join('\n');
		textarea.value = `${textarea.value.slice(0, lineStart)}${nextBlock}${textarea.value.slice(lineEnd)}`;
		textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
		textarea.focus();
	}

	private selectedLineRange(textarea: HTMLTextAreaElement): { lineStart: number; lineEnd: number } {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const value = textarea.value;
		const lineStart = value.lastIndexOf('\n', start - 1) + 1;
		const nextBreak = value.indexOf('\n', end);
		const lineEnd = nextBreak === -1 ? value.length : nextBreak;
		return { lineStart, lineEnd };
	}

	private save(): void {
		this.onSave(this.textarea?.value ?? '');
		this.close();
	}
}
