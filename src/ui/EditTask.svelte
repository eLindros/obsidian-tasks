<script lang="ts">
    import chrono from 'chrono-node';
    import { onMount } from 'svelte';
    import { getSettings } from '../Settings';
    import { Priority, Task } from '../Task';

    export let task: Task;
    export let onSubmit: (updatedTasks: Task[]) => void | Promise<void>;

    let descriptionInput: HTMLInputElement;
    let editableTask: {
        description: string;
        priority: 'none' | 'low' | 'medium' | 'high';
        dueDate: string;
    } = {
        description: '',
        priority: 'none',
        dueDate: '',
    };

    let parsedDueDate: string = '';

    $: {
        if (!editableTask.dueDate) {
            parsedDueDate = '<i>no due date</>';
        } else {
            const parsed = chrono.parseDate(editableTask.dueDate, new Date(), {
                forwardDate: true,
            });
            if (parsed !== null) {
                parsedDueDate = window.moment(parsed).format('YYYY-MM-DD');
            } else {
                parsedDueDate = '<i>invalid due date</i>';
            }
        }
    }

    onMount(() => {
        const { globalFilter } = getSettings();
        const description = task.description
            .replace(globalFilter, '')
            .replace('  ', ' ')
            .trim();

        let priority: 'none' | 'low' | 'medium' | 'high' = 'none';
        if (task.priority === Priority.Low) {
            priority = 'low';
        } else if (task.priority === Priority.Medium) {
            priority = 'medium';
        } else if (task.priority === Priority.High) {
            priority = 'high';
        }

        editableTask = {
            description,
            priority,
            dueDate: task.dueDate ? task.dueDate.format('YYYY-MM-DD') : ''
        };
        setTimeout(() => {
            descriptionInput.focus();
        }, 10);
    });

    const _onSubmit = () => {
        const { globalFilter } = getSettings();
        let description = editableTask.description.trim();
        if (!description.includes(globalFilter)) {
            description = globalFilter + ' ' + description;
        }

        let dueDate: moment.Moment | null = null;
        const parsedDueDate = chrono.parseDate(
            editableTask.dueDate,
            new Date(),
            { forwardDate: true },
        );
        if (parsedDueDate !== null) {
            dueDate = window.moment(parsedDueDate);
        }

        let parsedPriority: Priority;
        switch (editableTask.priority) {
            case 'low':
                parsedPriority = Priority.Low;
                break;
            case 'medium':
                parsedPriority = Priority.Medium;
                break;
            case 'high':
                parsedPriority = Priority.High;
                break;
            default:
                parsedPriority = Priority.None;
        }

        const updatedTask = new Task({
            ...task,
            description,
            priority: parsedPriority,
            dueDate,
        });

        onSubmit([updatedTask]);
    };
</script>

<div class="tasks-modal">
    <form on:submit|preventDefault={_onSubmit}>
        <div class="tasks-modal-section">
            <label for="description">Description</label>
            <input
                bind:value={editableTask.description}
                bind:this={descriptionInput}
                id="description"
                type="text"
                class="tasks-modal-description"
                placeholder="Take out the trash"
            />
        </div>
        <hr />
        <div class="tasks-modal-section">
            <label for="priority">Priority</label>
            <select
                bind:value={editableTask.priority}
                id="priority"
                class="dropdown"
            >
                <option value="none">None</option>
                <option value="high">⏫ High</option>
                <option value="medium">🔼 Medium</option>
                <option value="low">🔽 Low</option>
            </select>
        </div>
        <hr />
        <div class="tasks-modal-section">
            <div class="tasks-modal-date">
                <label for="due">Due</label>
                <input
                    bind:value={editableTask.dueDate}
                    id="due"
                    type="text"
                    placeholder="Try 'Monday' or 'tomorrow'."
                />
                <code>📅 {@html parsedDueDate}</code>
            </div>
        <hr />
        <div class="tasks-modal-section" />
        <div class="tasks-modal-section">
            <button type="submit" class="mod-cta">Apply</button>
        </div>
    </form>
</div>
