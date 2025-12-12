# Traffic Route Optimizer

Frontend (Leaflet) + Flask backend + LSTM model for route travel-time estimation and simple optimization.

Quick start (Docker)

1. Install Docker Desktop and start it.
2. (Optional) Edit `frontend/index.html` and set `window.BACKEND_URL = 'http://backend:5001'` so the frontend built image points to the backend service name inside Docker Compose.
3. From the project root run in PowerShell:

```powershell
docker compose up --build -d
```

4. Open the frontend at: http://localhost:5500

Build/run notes
- The backend image is built from `./backend` and exposes port `5001`.
- The frontend image is an nginx static site built from `./frontend` and exposed on host port `5500`.

Development & training
- See `backend/DEVELOPMENT.md` for step-by-step developer instructions (virtualenv, data processing, training the LSTM, and running locally).

If something fails
- Check container logs:

```powershell
docker compose logs -f
```

- To rebuild after changes:

```powershell
docker compose up --build -d
```
