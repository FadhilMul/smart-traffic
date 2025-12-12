# Backend Development Guide

This guide covers local development tasks for the Flask backend, training the LSTM model, and running the app.

Prerequisites
- Python 3.8+ installed
- pip
- (Optional) Git
- Docker (for containerized runs)

Create virtual environment and install dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

Prepare data sequences

```powershell
python build_sequences.py
```

Train the LSTM model (writes `model/lstm_model.h5` and `model/scaler.joblib`)

```powershell
python train_model_fixed.py
```

Run the Flask app locally

```powershell
# ensure model files exist in backend/model
$env:PORT = "5001"
python app.py
```

Notes about model and scaler
- Trained model and scaler are saved under `backend/model/`.
- If you re-train, re-copy or rebuild the backend image so the container uses the updated model.

Docker build & run (backend only)

```powershell
cd ..
docker build -t traffic-backend ./backend
docker run -p 5001:5001 --name traffic-backend -e PORT=5001 traffic-backend
```

When running with Docker Compose (recommended for frontend+backend), see the project root README.md for `docker compose up --build` instructions.

Troubleshooting
- If port 5000 is already reserved on Windows, use `PORT=5001` as above.
- If you encounter CORS issues for external geocoding (Nominatim / Overpass), consider proxying geocoding requests through this backend (add routes that fetch remote APIs server-side).
