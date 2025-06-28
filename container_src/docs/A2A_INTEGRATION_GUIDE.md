# Claude Code A2A Integration Guide

This document provides instructions for external AI agents to communicate with the Claude Code container service using the implemented Agent-to-Agent (A2A) protocol.

## 1. Service Discovery

The Claude Code Agent advertises its capabilities and endpoints via an Agent Card.

*   **Agent Card URL:** `/.well-known/agent.json` (relative to the container's base URL)
    *   Example: If the container is accessible at `http://claude-container.example.com`, the Agent Card will be at `http://claude-container.example.com/.well-known/agent.json`.

The Agent Card (a JSON file) contains:
*   Agent's name, description, version.
*   A list of supported A2A methods (e.g., `tasks/send`, `tasks/get`) with their input/output schemas.
*   Endpoint URLs (e.g., `/rpc` for JSON-RPC, `/oauth/token` for authentication).
*   Authentication details (specifying OAuth 2.0 Client Credentials flow).

## 2. Authentication

Communication with the A2A service's `/rpc` endpoint is secured using OAuth 2.0 with the **Client Credentials Grant Flow**.

**Steps to Authenticate:**

1.  **Obtain Client Credentials:**
    *   You will need a `client_id` and `client_secret`.
    *   For development/testing, the following hardcoded credentials can be used:
        *   `client_id`: `a2a-claude-client-123`
        *   `client_secret`: `verysecretclientkey`
    *   In a production environment, these credentials must be securely provisioned.

2.  **Request an Access Token:**
    *   Make a `POST` request to the token endpoint specified in the Agent Card (e.g., `/oauth/token`).
    *   **Method:** `POST`
    *   **Headers:**
        *   `Content-Type: application/x-www-form-urlencoded`
    *   **Body (form-urlencoded):**
        ```
        grant_type=client_credentials&client_id=<YOUR_CLIENT_ID>&client_secret=<YOUR_CLIENT_SECRET>
        ```
    *   **Example using cURL:**
        ```bash
        curl -X POST -H "Content-Type: application/x-www-form-urlencoded" \
             -d "grant_type=client_credentials&client_id=a2a-claude-client-123&client_secret=verysecretclientkey" \
             http://<container_base_url>/oauth/token
        ```

3.  **Receive Access Token:**
    *   A successful response will be a JSON object containing:
        ```json
        {
          "access_token": "your_generated_access_token",
          "token_type": "Bearer",
          "expires_in": 3600
        }
        ```
    *   Store the `access_token` securely. It has a limited lifetime (e.g., 1 hour). You will need to request a new token when it expires.

## 3. Interacting with the A2A RPC Endpoint

All A2A method calls are made via `POST` requests to the JSON-RPC endpoint specified in the Agent Card (e.g., `/rpc`).

*   **Endpoint URL:** `/rpc` (relative to the container's base URL)
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer <YOUR_ACCESS_TOKEN>` (obtained from the `/oauth/token` endpoint)
*   **Body:** A standard JSON-RPC 2.0 request object.

### Supported A2A Methods

#### a. `tasks/send`

Submits a new coding task to the Claude Code Agent.

*   **JSON-RPC Request Example:**
    ```json
    {
      "jsonrpc": "2.0",
      "method": "tasks/send",
      "params": {
        "id": "unique-task-id-001",
        "message": {
          "role": "user",
          "parts": [
            {
              "text": "Write a Python script that lists all files in a directory."
            }
          ]
        },
        "context": {
          "repositoryUrl": "https://github.com/someuser/somerepo",
          "targetDirectory": "src/utils"
        }
      },
      "id": "request-id-123"
    }
    ```
    *   `params.id`: A unique client-generated ID for the task.
    *   `params.message.parts[0].text`: The natural language prompt for Claude Code.
    *   `params.context` (optional):
        *   `repositoryUrl`: If provided, the agent will clone this Git repository and operate within it.
        *   Other key-value pairs to provide additional context to the task.

*   **JSON-RPC Response (Success - Task Submitted):**
    ```json
    {
      "jsonrpc": "2.0",
      "result": {
        "id": "unique-task-id-001",
        "state": "submitted", // Or "working" if processing starts very quickly
        "message": {
          "role": "agent",
          "parts": [
            {
              "text": "Task submitted. Queued for Claude Code processing."
            }
          ]
        }
      },
      "id": "request-id-123"
    }
    ```
    The task execution is asynchronous. Use `tasks/get` to poll for completion.

#### b. `tasks/get`

Retrieves the status and results of a previously submitted task.

*   **JSON-RPC Request Example:**
    ```json
    {
      "jsonrpc": "2.0",
      "method": "tasks/get",
      "params": {
        "id": "unique-task-id-001"
      },
      "id": "request-id-124"
    }
    ```
    *   `params.id`: The ID of the task previously submitted via `tasks/send`.

*   **JSON-RPC Response (Success - Task Details):**
    ```json
    {
      "jsonrpc": "2.0",
      "result": {
        "id": "unique-task-id-001",
        "state": "completed", // Could also be "submitted", "working", "failed", "canceled"
        "input": { /* Original params from tasks/send */ },
        "context": { /* Original context from tasks/send */ },
        "message": {
          "role": "agent",
          "parts": [ { "text": "Claude Code processing complete." } ]
        },
        "artifacts": [
          {
            "name": "claude_output.txt",
            "mimeType": "text/plain",
            "parts": [ { "text": "def list_files(directory):\n  # ... python code ..." } ]
          }
          // Other artifacts, like code change summaries, if generated
        ],
        "createdAt": "2023-10-27T10:00:00Z",
        "updatedAt": "2023-10-27T10:05:00Z"
      },
      "id": "request-id-124"
    }
    ```
    *   `result.state`: Current state of the task. Poll until "completed", "failed", or "canceled".
    *   `result.artifacts`: An array of outputs from the task, such as generated code or logs.

## 4. Error Handling

*   **Authentication Errors:** If the access token is missing, invalid, or expired, the `/rpc` endpoint will return an HTTP `400` or `401` error.
*   **JSON-RPC Errors:** Standard JSON-RPC error responses will be provided for issues like:
    *   Invalid JSON-RPC format.
    *   Method not found.
    *   Invalid parameters for a method.
    *   Internal errors during task processing.
    *   Task not found (for `tasks/get`).

    Example JSON-RPC Error:
    ```json
    {
        "jsonrpc": "2.0",
        "error": {
            "code": -32602, // Invalid params
            "message": "Invalid params: 'id' is required."
        },
        "id": "request-id-125"
    }
    ```

This guide should provide the necessary information for an external agent to integrate with the Claude Code A2A service.
Remember to replace `<container_base_url>` with the actual accessible URL of the deployed container.
```
