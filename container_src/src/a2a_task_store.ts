// Based on the concepts from sing1ee/a2a-directory TaskStore

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled"
  | "unknown";

export interface TaskMessagePart {
  text?: string;
  base64?: string; // For binary data
  // Potentially other types like images, etc.
}

export interface TaskMessage {
  role: "user" | "agent" | "system";
  parts: TaskMessagePart[];
}

export interface TaskArtifact {
  name: string;
  mimeType: string;
  parts: TaskMessagePart[];
}

export interface Task {
  id: string;
  state: TaskState;
  message?: TaskMessage; // Initial user message or agent's current response
  input?: any; // The original parameters for the task/send
  context?: any; // Optional context provided during task creation
  artifacts?: TaskArtifact[];
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaskStore {
  createTask(id: string, input: any, context?: any, initialMessage?: TaskMessage): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, state: TaskState, update: Partial<Omit<Task, "id" | "createdAt" | "input">>): Promise<Task | null>;
  listTasks(): Promise<Task[]>; // Optional, for debugging/admin
}

export class InMemoryTaskStore implements ITaskStore {
  private tasks: Map<string, Task> = new Map();

  async createTask(id: string, input: any, context?: any, initialMessage?: TaskMessage): Promise<Task> {
    if (this.tasks.has(id)) {
      throw new Error(`Task with id ${id} already exists.`);
    }
    const now = new Date();
    const task: Task = {
      id,
      input,
      context,
      state: "submitted",
      message: initialMessage,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return { ...task }; // Return a copy
  }

  async getTask(id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    return task ? { ...task } : null;
  }

  async updateTask(id: string, state: TaskState, update: Partial<Omit<Task, "id" | "createdAt" | "input">>): Promise<Task | null> {
    const task = this.tasks.get(id);
    if (!task) {
      return null;
    }
    const updatedTask: Task = {
      ...task,
      ...update,
      state,
      updatedAt: new Date(),
    };
    this.tasks.set(id, updatedTask);
    return { ...updatedTask };
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).map(task => ({ ...task }));
  }
}
