import { Component, MarkdownRenderer } from 'obsidian';

import type { Moment } from 'moment';
import { replaceTaskWithTasks } from './File';
import { getSettings } from './Settings';
import { LayoutOptions } from './LayoutOptions';
import { Urgency } from './Urgency';

export enum Status {
    Todo = 'Todo',
    Done = 'Done',
}

// Sort low below none.
export enum Priority {
    High = '1',
    Medium = '2',
    None = '3',
    Low = '4',
    Waiting = '5',
}

export class Task {
    public readonly status: Status;
    public readonly description: string;
    public readonly path: string;
    public readonly indentation: string;
    /** Line number where the section starts that contains this task. */
    public readonly sectionStart: number;
    /** The index of the nth task in its section. */
    public readonly sectionIndex: number;
    /**
     * The original character from within `[]` in the document.
     * Required to be added to the LI the same way obsidian does as a `data-task` attribute.
     */
    public readonly originalStatusCharacter: string;
    public readonly precedingHeader: string | null;

    public readonly priority: Priority;

    public readonly dueDate: Moment | null;
    public readonly doneDate: Moment | null;

    /** The blockLink is a "^" annotation after the dates/recurrence rules. */
    public readonly blockLink: string;

    public static readonly dateFormat = 'YYYY-MM-DD';
    public static readonly taskRegex = /^([\s\t]*)[-*] +\[(.)\] *(.*)/u;
    // The following regexes end with `$` because they will be matched and
    // removed from the end until none are left.
    public static readonly priorityRegex = /(!!|!\?|\?\?|>>)$/u;
    public static readonly dueDateRegex = /[📅📆🗓] ?(\d{4}-\d{2}-\d{2})$/u;
    public static readonly doneDateRegex = /✅ ?(\d{4}-\d{2}-\d{2})$/u;
    public static readonly blockLinkRegex = / \^[a-zA-Z0-9-]+$/u;

    private _urgency: number | null = null;

    constructor({
        status,
        description,
        path,
        indentation,
        sectionStart,
        sectionIndex,
        originalStatusCharacter,
        precedingHeader,
        priority,
        dueDate,
        doneDate,
        blockLink,
    }: {
        status: Status;
        description: string;
        path: string;
        indentation: string;
        sectionStart: number;
        sectionIndex: number;
        originalStatusCharacter: string;
        precedingHeader: string | null;
        priority: Priority;
        dueDate: moment.Moment | null;
        doneDate: moment.Moment | null;
        blockLink: string;
    }) {
        this.status = status;
        this.description = description;
        this.path = path;
        this.indentation = indentation;
        this.sectionStart = sectionStart;
        this.sectionIndex = sectionIndex;
        this.originalStatusCharacter = originalStatusCharacter;
        this.precedingHeader = precedingHeader;

        this.priority = priority;

        this.dueDate = dueDate;
        this.doneDate = doneDate;

        this.blockLink = blockLink;
    }

    public static fromLine({
        line,
        path,
        sectionStart,
        sectionIndex,
        precedingHeader,
    }: {
        line: string;
        path: string;
        sectionStart: number;
        sectionIndex: number;
        precedingHeader: string | null;
    }): Task | null {
        const regexMatch = line.match(Task.taskRegex);
        if (regexMatch === null) {
            return null;
        }

        const indentation = regexMatch[1];
        const statusString = regexMatch[2].toLowerCase();

        let status: Status;
        switch (statusString) {
            case ' ':
                status = Status.Todo;
                break;
            default:
                status = Status.Done;
        }

        // match[3] includes the whole body of the task after the brackets.
        const body = regexMatch[3].trim();

        const { globalFilter } = getSettings();
        if (!body.includes(globalFilter)) {
            return null;
        }

        let description = body;

        const blockLinkMatch = description.match(this.blockLinkRegex);
        const blockLink = blockLinkMatch !== null ? blockLinkMatch[0] : '';

        if (blockLink !== '') {
            description = description.replace(this.blockLinkRegex, '').trim();
        }

        // Keep matching and removing special strings from the end of the
        // description in any order. The loop should only run once if the
        // strings are in the expected order after the description.
        let matched: boolean;
        let priority: Priority = Priority.None;
        let dueDate: Moment | null = null;
        let doneDate: Moment | null = null;
        // Add a "max runs" failsafe to never end in an endless loop:
        const maxRuns = 7;
        let runs = 0;
        do {
            matched = false;
            const priorityMatch = description.match(Task.priorityRegex);
            if (priorityMatch !== null) {
                switch (priorityMatch[1]) {
                    case '??':
                        priority = Priority.Low;
                        break;
                    case '!?':
                        priority = Priority.Medium;
                        break;
                    case '!!':
                        priority = Priority.High;
                        break;
                    case '>>':
                        priority = Priority.Waiting;
                        break;
                }

                description = description
                    .replace(Task.priorityRegex, '')
                    .trim();
                matched = true;
            }

            const doneDateMatch = description.match(Task.doneDateRegex);
            if (doneDateMatch !== null) {
                doneDate = window.moment(doneDateMatch[1], Task.dateFormat);
                description = description
                    .replace(Task.doneDateRegex, '')
                    .trim();
                matched = true;
            }

            const dueDateMatch = description.match(Task.dueDateRegex);
            if (dueDateMatch !== null) {
                dueDate = window.moment(dueDateMatch[1], Task.dateFormat);
                description = description.replace(Task.dueDateRegex, '').trim();
                matched = true;
            }

            runs++;
        } while (matched && runs <= maxRuns);

        const task = new Task({
            status,
            description,
            path,
            indentation,
            sectionStart,
            sectionIndex,
            originalStatusCharacter: statusString,
            precedingHeader,
            priority,
            dueDate,
            doneDate,
            blockLink,
        });

        return task;
    }

    public async toLi({
        parentUlElement,
        listIndex,
        layoutOptions,
    }: {
        parentUlElement: HTMLElement;
        /** The nth item in this list (including non-tasks). */
        listIndex: number;
        layoutOptions?: LayoutOptions;
    }): Promise<HTMLLIElement> {
        const li: HTMLLIElement = parentUlElement.createEl('li');
        li.addClasses(['task-list-item', 'plugin-tasks-list-item']);

        let taskAsString = this.toString(layoutOptions);
        const { globalFilter, removeGlobalFilter } = getSettings();
        if (removeGlobalFilter) {
            taskAsString = taskAsString.replace(globalFilter, '').trim();
        }

        const textSpan = li.createSpan();
        textSpan.addClass('tasks-list-text');

        await MarkdownRenderer.renderMarkdown(
            taskAsString,
            textSpan,
            this.path,
            null as unknown as Component,
        );

        // Unwrap the p-tag that was created by the MarkdownRenderer:
        const pElement = textSpan.querySelector('p');
        if (pElement !== null) {
            while (pElement.firstChild) {
                textSpan.insertBefore(pElement.firstChild, pElement);
            }
            pElement.remove();
        }

        // Remove an empty trailing p-tag that the MarkdownRenderer appends when there is a block link:
        textSpan.findAll('p').forEach((pElement) => {
            if (!pElement.hasChildNodes()) {
                pElement.remove();
            }
        });

        // Remove the footnote that the MarkdownRenderer appends when there is a footnote in the task:
        textSpan.findAll('.footnotes').forEach((footnoteElement) => {
            footnoteElement.remove();
        });

        const checkbox = li.createEl('input');
        checkbox.addClass('task-list-item-checkbox');
        checkbox.type = 'checkbox';
        if (this.status !== Status.Todo) {
            checkbox.checked = true;
            li.addClass('is-checked');
        }
        checkbox.onClickEvent((event: MouseEvent) => {
            event.preventDefault();
            // It is required to stop propagation so that obsidian won't write the file with the
            // checkbox (un)checked. Obsidian would write after us and overwrite our change.
            event.stopPropagation();

            // Should be re-rendered as enabled after update in file.
            checkbox.disabled = true;
            const toggledTasks = this.toggle();
            replaceTaskWithTasks({
                originalTask: this,
                newTasks: toggledTasks,
            });
        });

        li.prepend(checkbox);

        // Set these to be compatible with stock obsidian lists:
        li.setAttr('data-task', this.originalStatusCharacter.trim()); // Trim to ensure empty attribute for space. Same way as obsidian.
        li.setAttr('data-line', listIndex);
        checkbox.setAttr('data-line', listIndex);

        if (layoutOptions?.shortMode) {
            this.addTooltip({ element: textSpan });
        }

        return li;
    }

    public toString(layoutOptions?: LayoutOptions): string {
        layoutOptions = layoutOptions ?? new LayoutOptions();
        let taskString = this.description;

        if (!layoutOptions.hidePriority) {
            let priority: string = '';

            if (this.priority === Priority.High) {
                priority = ' !!';
            } else if (this.priority === Priority.Medium) {
                priority = ' !?';
            } else if (this.priority === Priority.Low) {
                priority = ' ??';
            } else if (this.priority === Priority.Waiting) {
                priority = ' >>';
            }

            taskString += priority;
        }

        if (!layoutOptions.hideDueDate && this.dueDate) {
            const dueDate: string = layoutOptions.shortMode
                ? ' 📅'
                : ` 📅 ${this.dueDate.format(Task.dateFormat)}`;
            taskString += dueDate;
        }

        if (!layoutOptions.hideDoneDate && this.doneDate) {
            const doneDate: string = layoutOptions.shortMode
                ? ' ✅'
                : ` ✅ ${this.doneDate.format(Task.dateFormat)}`;
            taskString += doneDate;
        }

        const blockLink: string = this.blockLink ?? '';
        taskString += blockLink;

        return taskString;
    }

    public toFileLineString(): string {
        return `${this.indentation}- [${
            this.originalStatusCharacter
        }] ${this.toString()}`;
    }

    /**
     * Toggles this task and returns the resulting tasks.
     *
     * Toggling can result in more than one returned task in the case of
     * recurrence. If it is a recurring task, the toggled task will be returned
     * together with the next occurrence in the order `[next, toggled]`. If the
     * task is not recurring, it will return `[toggled]`.
     */
    public toggle(): Task[] {
        const newStatus: Status =
            this.status === Status.Todo ? Status.Done : Status.Todo;

        let newDoneDate = null;

        if (newStatus !== Status.Todo) {
            newDoneDate = window.moment();
        }

        const toggledTask = new Task({
            ...this,
            status: newStatus,
            doneDate: newDoneDate,
            originalStatusCharacter: newStatus === Status.Done ? 'x' : ' ',
        });

        const newTasks: Task[] = [];

        // Write next occurrence before previous occurrence.
        newTasks.push(toggledTask);

        return newTasks;
    }

    public get urgency(): number {
        if (this._urgency === null) {
            this._urgency = Urgency.calculate(this);
        }

        return this._urgency;
    }

    public get filename(): string | null {
        const fileNameMatch = this.path.match(/([^/]+)\.md$/);
        if (fileNameMatch !== null) {
            return fileNameMatch[1];
        } else {
            return null;
        }
    }

    public get linkText(): string | null {
        let linkText = this.filename;
        if (linkText === null) {
            return null;
        }
        // Otherwise, this wouldn't provide additional information and only take up space.
        if (
            this.precedingHeader !== null &&
            this.precedingHeader !== linkText
        ) {
            linkText = linkText + ' > ' + this.precedingHeader;
        }

        return linkText;
    }

    private addTooltip({ element }: { element: HTMLElement }): void {
        element.addEventListener('mouseenter', () => {
            const tooltip = element.createDiv();
            tooltip.addClasses(['tooltip', 'mod-right']);

            if (this.dueDate) {
                const dueDateDiv = tooltip.createDiv();
                dueDateDiv.setText(
                    Task.toTooltipDate({
                        signifier: '📅',
                        date: this.dueDate,
                    }),
                );
            }

            if (this.doneDate) {
                const doneDateDiv = tooltip.createDiv();
                doneDateDiv.setText(
                    Task.toTooltipDate({
                        signifier: '✅',
                        date: this.doneDate,
                    }),
                );
            }

            if (this.linkText) {
                const backlinkDiv = tooltip.createDiv();
                backlinkDiv.setText(`🔗 ${this.linkText}`);
            }

            element.addEventListener('mouseleave', () => {
                tooltip.remove();
            });
        });
    }

    private static toTooltipDate({
        signifier,
        date,
    }: {
        signifier: string;
        date: Moment;
    }): string {
        return `${signifier} ${date.format(Task.dateFormat)} (${date.from(
            window.moment().startOf('day'),
        )})`;
    }
}
