/**
 * @fileoverview Executes a Directed Acyclic Graph (DAG) of tasks.
 *
 * This module is responsible for taking a DAG representation of a task plan,
 * validating its structure, and executing the tasks in the correct order
 * based on their dependencies. It manages the state of the graph, handles
 * parallel execution of independent tasks, and resolves data references
 * between tasks.
 */

class DAGExecutor {
  /**
   * @param {object} toolExecutor - An object or module with a method `executeTool(toolName, query)`
   * @param {Array<object>} mcpServers - An array of all available MCP server manifests.
   */
  constructor(toolExecutor, mcpServers = []) {
    if (!toolExecutor || typeof toolExecutor.executeTool !== 'function') {
      throw new Error('A toolExecutor with an executeTool method is required.');
    }
    this.toolExecutor = toolExecutor;
    this.mcpServers = mcpServers;
    this.toolkits = this.buildToolkits();
  }

  buildToolkits() {
    const toolkits = {};
    for (const server of this.mcpServers) {
        if (server && server.toolkit) {
            if (!toolkits[server.toolkit]) {
                toolkits[server.toolkit] = [];
            }
            toolkits[server.toolkit].push(...server.tools.map(t => t.name));
        }
    }
    return toolkits;
  }

  /**
   * Validates and executes the entire DAG.
   * @param {Array<object>} dag - The array of task objects representing the DAG.
   * @returns {Promise<object>} A promise that resolves with the results of all tasks.
   */
  async execute(dag) {
    if (!this.isValidDAG(dag)) {
      throw new Error('Invalid DAG structure provided.');
    }

    const taskResults = new Map();
    const taskPromises = new Map();

    for (const task of dag) {
      this.executeTask(task, dag, taskResults, taskPromises);
    }

    await Promise.all(Array.from(taskPromises.values()));

    // Convert Map to a plain object for easier consumption
    return Object.fromEntries(taskResults);
  }

  /**
   * Executes a single task, waiting for its dependencies to complete first.
   * @param {object} task - The task object to execute.
   * @param {Array<object>} dag - The full DAG, for context.
   * @param {Map<string, any>} taskResults - A map to store the results of completed tasks.
   * @param {Map<string, Promise<any>>} taskPromises - A map to store promises for running tasks.
   * @returns {Promise<any>} A promise that resolves when the task is complete.
   */
  executeTask(task, dag, taskResults, taskPromises) {
    if (taskPromises.has(task.id)) {
      return taskPromises.get(task.id);
    }

    const dependencyPromises = task.dependencies.map(depId => {
      const depTask = dag.find(t => t.id === depId);
      if (!depTask) {
        return Promise.reject(new Error(`Dependency '${depId}' not found for task '${task.id}'.`));
      }
      return this.executeTask(depTask, dag, taskResults, taskPromises);
    });

    const promise = Promise.all(dependencyPromises).then(async () => {
      return this.executeTaskWithFallback(task, taskResults);
    });

    taskPromises.set(task.id, promise);
    return promise;
  }

  async executeTaskWithFallback(task, taskResults) {
    const resolvedQuery = this.resolveQuery(task.query, taskResults);
    let currentTool = task.tool;
    
    try {
        const result = await this.toolExecutor.executeTool(currentTool, resolvedQuery);
        taskResults.set(task.id, { result });
        return result;
    } catch (error) {
        console.warn(`Tool '${currentTool}' failed for task '${task.id}'. Error: ${error.message}. Looking for a fallback.`);
        
        const toolkit = this.getToolkitForTool(currentTool);
        if (toolkit) {
            const fallbackTools = this.toolkits[toolkit].filter(t => t !== currentTool);
            for (const fallbackTool of fallbackTools) {
                console.log(`Attempting fallback with tool '${fallbackTool}'...`);
                try {
                    const result = await this.toolExecutor.executeTool(fallbackTool, resolvedQuery);
                    taskResults.set(task.id, { result });
                    return result; // Fallback succeeded
                } catch (fallbackError) {
                    console.warn(`Fallback tool '${fallbackTool}' also failed. Error: ${fallbackError.message}`);
                }
            }
        }
        
        // If no fallback works or is available, throw the original error
        throw error;
    }
  }

  getToolkitForTool(toolName) {
    for (const toolkit in this.toolkits) {
        if (this.toolkits[toolkit].includes(toolName)) {
            return toolkit;
        }
    }
    return null;
  }

  /**
   * Resolves dynamic data references in a task's query string.
   * @param {string} query - The query string, which may contain `{{task_id.result}}` templates.
   * @param {Map<string, any>} taskResults - The map of completed task results.
   * @returns {string} The resolved query string.
   */
  resolveQuery(query, taskResults) {
    return query.replace(/{{(.*?)}}/g, (match, placeholder) => {
      const [taskId, resultField] = placeholder.trim().split('.');
      if (taskResults.has(taskId) && taskResults.get(taskId)[resultField]) {
        return taskResults.get(taskId)[resultField];
      }
      console.warn(`Could not resolve placeholder: ${placeholder}`);
      return match; // Return the original placeholder if resolution fails
    });
  }

  /**
   * Validates the structure of the DAG.
   * @param {Array<object>} dag - The array of task objects.
   * @returns {boolean} True if the DAG is valid, false otherwise.
   */
  isValidDAG(dag) {
    if (!Array.isArray(dag)) return false;

    const taskIds = new Set();
    for (const task of dag) {
      if (!task.id || !task.tool || !task.query || !Array.isArray(task.dependencies)) {
        console.error('Invalid task structure:', task);
        return false;
      }
      if (taskIds.has(task.id)) {
        console.error(`Duplicate task ID found: ${task.id}`);
        return false; // IDs must be unique
      }
      taskIds.add(task.id);
    }

    // Check for valid dependencies and cycles
    for (const task of dag) {
      const path = new Set([task.id]);
      const stack = [...task.dependencies];
      while (stack.length > 0) {
        const depId = stack.pop();
        if (path.has(depId)) return false; // Cycle detected
        if (!taskIds.has(depId)) return false; // Dependency doesn't exist
        path.add(depId);
        const depTask = dag.find(t => t.id === depId);
        stack.push(...depTask.dependencies);
      }
    }

    return true;
  }
}

export default DAGExecutor;