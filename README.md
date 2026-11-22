# LocalCode - Real-Time LAN Code Clipboard

A lightweight, self-hosted web application designed to instantly share code snippets and clipboard contents between devices on the same local area network (e.g. laptop and desktop PC).

## Features

- **Real-Time Synchronization**: Instantly synchronizes code edits and clipboard contents across all connected clients via WebSockets.
- **Developer-Focused Editor**: Powered by CodeMirror with syntax highlighting for JavaScript, TypeScript, Python, PHP, HTML, CSS, SQL, Bash/Shell, and Markdown.
- **One-Click Clipboard Actions**: Quick buttons to copy to and paste from the system clipboard.
- **Zero Heavy Dependencies**: Built with minimal Node.js and native WebSockets (`ws`), consuming minimal memory.
- **Docker Ready**: Includes `Dockerfile` and `docker-compose.yml` for isolated deployment.

## Architecture

- **Backend**: Node.js HTTP server + WebSocket (`ws`) server with debounced in-memory caching and JSON file fallback.
- **Frontend**: Clean dark interface with CodeMirror editor and responsive connection monitoring.
- **Container**: Alpine-based Node container running on port `3000`.

## Quick Start (Docker)

```bash
docker compose up -d --build
```

Access the application in your browser at `http://<server-ip>:3000`.

## Local Development

```bash
npm install
npm start
```
