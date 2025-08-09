# Directed Acyclic Graph (DAG) Structure for Multi-Agent System

This document defines the JSON structure for the Directed Acyclic Graph (DAG) used by the Planner (Agent 1) to construct complex task plans and the `DAGExecutor` to execute them.

## 1. Core Structure

The entire plan is a JSON object with a single root key, `dag`, which contains an array of task objects.

```json
{
  "dag": [
    {
      "id": "task1",
      "tool": "tool_name",
      "query": "some query",
      "dependencies": []
    },
    {
      "id": "task2",
      "tool": "another_tool",
      "query": "query using output from task1: {{task1.result}}",
      "dependencies": ["task1"]
    }
  ]
}
```

## 2. Task Object Schema

Each object in the `dag` array represents a single task (a node in the graph) and has the following properties:

| Key            | Type           | Required | Description                                                                                                                              |
|----------------|----------------|----------|------------------------------------------------------------------------------------------------------------------------------------------|
| `id`           | String         | Yes      | A unique identifier for the task within the DAG (e.g., "task1", "get_birth_date"). Cannot contain spaces or special characters.             |
| `tool`         | String         | Yes      | The name of the tool to be executed (e.g., `serper_web_search`, `calculator`).                                                          |
| `query`        | String         | Yes      | The input query for the tool. It can be a static string or contain dynamic references to the outputs of other tasks.                       |
| `dependencies` | Array[String]  | Yes      | An array of `id`s of tasks that must be successfully completed before this task can be executed. An empty array `[]` signifies no dependencies. |

## 3. Dynamic Data Referencing

To create true dependencies and enable complex reasoning, tasks can reference the output of their predecessors. The `DAGExecutor` will support a simple templating syntax within the `query` field.

- **Syntax**: `{{task_id.output_field}}`
- **`task_id`**: The `id` of a task listed in the `dependencies` array.
- **`output_field`**: The specific piece of data to extract from the dependency's result. For initial implementation, we will use a generic `result` field.

### Example

Consider the query: *"Who is older, Emperor Wu of Han or Julius Caesar, and what was the age difference?"*

The Planner agent would generate the following DAG:

```json
{
  "dag": [
    {
      "id": "find_emperor_wu_age",
      "tool": "serper_web_search",
      "query": "age of Emperor Wu of Han at death",
      "dependencies": []
    },
    {
      "id": "find_caesar_age",
      "tool": "serper_web_search",
      "query": "age of Julius Caesar at death",
      "dependencies": []
    },
    {
      "id": "calculate_difference",
      "tool": "calculator",
      "query": "Calculate the difference between {{find_emperor_wu_age.result}} and {{find_caesar_age.result}}",
      "dependencies": ["find_emperor_wu_age", "find_caesar_age"]
    }
  ]
}
```

This structure enables the system to:
1.  Execute `find_emperor_wu_age` and `find_caesar_age` in parallel since they have no dependencies.
2.  Wait for both to complete successfully.
3.  Inject their outputs into the `query` for the `calculate_difference` task before executing it.