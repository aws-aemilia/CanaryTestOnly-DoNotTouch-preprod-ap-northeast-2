import sleep from "./sleep";

interface Task {
  run: () => Promise<void>;
  key: string;
}

/**
 * Allows running tasks in concurrently while limiting concurrency
 */
export class ConcurrentTaskRunner {
  private tasksByKey = new Map<string, number>();

  constructor(private maxConcurrencyByKey: number) {}

  public async run(tasks: Task[]): Promise<void> {
    const promises: Promise<void>[] = [];

    while (tasks.length > 0) {
      const task = tasks.pop();

      if (!task) {
        continue;
      }

      const runningTasks = this.tasksByKey.get(task.key) ?? 0;

      if (runningTasks >= this.maxConcurrencyByKey) {
        tasks.unshift(task);
        console.info("Key reached concurrency limit:", task.key, runningTasks);
        console.info("Await existing tasks to complete:", task.key);

        await sleep(1000);
        continue;
      }

      console.info(
        "Running task with key/runningTasks:",
        task.key,
        runningTasks
      );
      const p = task
        .run()
        .catch((err) => {
          tasks.unshift(task);
          console.error("Retrying the task", task);
          console.error(err);
        })
        .finally(() => {
          const currentRunningTasks = this.tasksByKey.get(task.key);
          if (!currentRunningTasks) {
            throw new Error("No current running tasks");
          }

          this.tasksByKey.set(task.key, currentRunningTasks - 1);
          console.info(
            "Task completed with key:",
            task.key,
            currentRunningTasks
          );
        });

      this.tasksByKey.set(task.key, runningTasks + 1);
      promises.push(p);
      // Avoid throttling
      await sleep(1000);
    }

    await Promise.all(promises);
  }
}
