import { EditorView, PluginValue, ViewPlugin } from '@codemirror/view';

import { Task } from './Task';

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

class LivePreviewExtension implements PluginValue {
    private readonly view: EditorView;

    constructor(view: EditorView) {
        this.view = view;

        this.handleClickEvent = this.handleClickEvent.bind(this);
        this.view.dom.addEventListener('click', this.handleClickEvent);
    }

    public destroy(): void {
        this.view.dom.removeEventListener('click', this.handleClickEvent);
    }

    private handleClickEvent(event: MouseEvent): boolean {
        const { target } = event;

        // Only handle checkbox clicks.
        if (
            !target ||
            !(target instanceof HTMLInputElement) ||
            target.type !== 'checkbox'
        ) {
            return false;
        }

        const { state } = this.view;
        const position = this.view.posAtDOM(target as Node);
        const line = state.doc.lineAt(position);
        const task = Task.fromLine({
            line: line.text,
            // None of this data is relevant here.
            // The task is created, toggled, and written back to the CM6 document,
            // replacing the old task in-place.
            path: '',
            sectionStart: 0,
            sectionIndex: 0,
            precedingHeader: null,
        });

        // Only handle checkboxes of tasks.
        if (task === null) {
            return false;
        }

        // We need to prevent default so that the checkbox is only handled by us and not obsidian.
        event.preventDefault();

        // Clicked on a task's checkbox. Toggle the task and set it.
        const toggled = task.toggle();
        const toggledString = toggled
            .map((task) => task.toFileLineString())
            .join(state.lineBreak);

        // Creates a CodeMirror transaction in order to updat the document.
        const transaction = state.update({
            changes: {
                from: line.from,
                to: line.to,
                insert: toggledString,
            },
        });
        this.view.dispatch(transaction);

        return true;
    }
}
