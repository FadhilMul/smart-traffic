Backend for Traffic LSTM route optimization

Quickstart

- Create a Python virtual environment and install requirements:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

- Train a model (this creates `backend/model/lstm_model.h5`):

```powershell
python train_model.py
```

- Run the API server:

```powershell
python app.py
```

Endpoints
- `GET /health` - returns model status
- `POST /predict` - body: `{ "history": [<min_values>] }` returns predicted travel time
- `POST /optimize` - body: `{ "origin": "A", "destination": "B", "distance_m": 1234, "duration_s": 600 }` returns predicted travel time and history used

Notes
- This is a minimal example using synthetic data. For production use, replace synthetic training data with real historical travel-time sequences, add proper scaler persistence, validation and monitoring.
