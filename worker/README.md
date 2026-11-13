# EssaStudio Render Worker (experimental)

This is a separate Remotion rendering service. It is intentionally not imported into the FastAPI process.

## Required environment variables

- `WORKER_TOKEN`: long random secret shared only with the API service.
- `PORT`: defaults to 8081.
- `WORKER_WORKSPACE_ROOT`: defaults to `/workspace`.
- `WORKER_OUTPUT_ROOT`: defaults to `/output`.

## Endpoints

- `GET /health`: public health check.
- `POST /jobs`: authenticated job submission.
- `GET /jobs/{job_id}`: authenticated job status.

## Deployment requirements

Deploy as a separate container service. Do not place API credentials or database credentials in this worker.
Set CPU, memory, disk, and request-size limits. Use a persistent output volume if generated MP4 files must survive restarts.

## Important security and reliability notes

The worker accepts project source files and runs npm/Remotion. That is execution of user-provided code. This prototype uses a non-root account, strict path/extension/file-size limits, fixed command arguments, no npm lifecycle scripts, one active job, and bounded timeouts. These controls are not a complete hostile-code sandbox. Before exposing it to untrusted users, add container-level network isolation, CPU/memory/PID limits, ephemeral per-job containers, and external durable job/output storage.

The current prototype stores job state in memory and is intended for a private proof of concept only. A restart clears job history.
