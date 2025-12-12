from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import numpy as np
import joblib

try:
    from tensorflow.keras.models import load_model
except Exception:
    load_model = None

APP_DIR = os.path.dirname(__file__)
MODEL_DIR = os.path.join(APP_DIR, 'model')
MODEL_FILE = os.path.join(MODEL_DIR, 'lstm_model.h5')
SCALER_FILE = os.path.join(MODEL_DIR, 'scaler.json')
SCALER_JOBLIB = os.path.join(MODEL_DIR, 'scaler.joblib')

app = Flask(__name__)
CORS(app)


def load_trained_model():
    model = None
    scaler = None
    if load_model and os.path.exists(MODEL_FILE):
        try:
            # Load with custom_objects to handle metrics serialization
            model = load_model(MODEL_FILE, custom_objects={'mse': 'mse'})
        except Exception as e:
            app.logger.error('Failed to load model: %s', e)

    # Prefer sklearn scaler persisted by joblib
    if os.path.exists(SCALER_JOBLIB):
        try:
            scaler = joblib.load(SCALER_JOBLIB)
        except Exception as e:
            app.logger.error('Failed to load joblib scaler: %s', e)
            scaler = None
    elif os.path.exists(SCALER_FILE):
        try:
            with open(SCALER_FILE, 'r') as f:
                scaler = json.load(f)
        except Exception as e:
            app.logger.error('Failed to load scaler info: %s', e)

    return model, scaler


MODEL, SCALER = load_trained_model()


@app.route('/')
def root():
    return jsonify({
        'message': 'Traffic LSTM Optimization API',
        'endpoints': {
            'GET /health': 'Check API health and model status',
            'POST /predict': 'Predict travel time from history',
            'POST /optimize': 'Optimize route with LSTM prediction'
        }
    })


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'model_loaded': MODEL is not None})


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json() or {}
    history = data.get('history')  # expected list of numbers (minutes)

    if not history or not isinstance(history, list):
        return jsonify({'error': 'history must be a list of numbers'}), 400

    # Basic fallback: if no model available, return mean
    if MODEL is None:
        pred = float(np.mean(history))
        return jsonify({'predicted_time_min': pred, 'source': 'fallback_mean'})
    # Prepare sequence and scale using loaded scaler (if any)
    seq = np.array(history, dtype=float)
    seq_len = MODEL.input_shape[1] if MODEL is not None else len(seq)
    if len(seq) < seq_len:
        pad = np.ones(seq_len - len(seq)) * seq.mean()
        seq = np.concatenate([pad, seq])
    elif len(seq) > seq_len:
        seq = seq[-seq_len:]

    # If scaler is a sklearn transformer (has transform), use it; otherwise expect JSON max-based scaler
    try:
        if hasattr(SCALER, 'transform'):
            scaled = SCALER.transform(seq.reshape(-1, 1)).reshape(-1)
            X = scaled.reshape((1, seq_len, 1))
            yhat = MODEL.predict(X)
            # inverse transform
            pred = float(SCALER.inverse_transform(yhat.reshape(-1, 1)).flatten()[0])
        else:
            max_val = SCALER.get('max', 1.0) if SCALER else 1.0
            scaled = seq / max_val
            X = scaled.reshape((1, seq_len, 1))
            yhat = MODEL.predict(X)
            pred = float(yhat.flatten()[0] * max_val)

        return jsonify({'predicted_time_min': pred, 'source': 'lstm_model'})
    except Exception as e:
        app.logger.error('Prediction error: %s', e)
        return jsonify({'error': 'prediction failed'}), 500


@app.route('/optimize', methods=['POST'])
def optimize():
    data = request.get_json() or {}
    origin = data.get('origin')
    destination = data.get('destination')
    distance_m = data.get('distance_m')
    duration_s = data.get('duration_s')  # route duration from routing engine
    hour = data.get('hour')

    # Build a simple history from provided duration by creating small variations
    if duration_s:
        base_min = duration_s / 60.0
    else:
        base_min = (distance_m or 1000) / 1000.0 * 5.0  # rough baseline: 5 min per km

    # synthetic short history
    history = [max(1.0, base_min * (0.9 + 0.2 * np.random.rand())) for _ in range(10)]

    # call predict endpoint logic
    req = {'history': history}
    # reuse predict logic directly
    if MODEL is None:
        pred = float(np.mean(history))
        source = 'fallback_mean'
    else:
        seq = np.array(history, dtype=float)
        seq_len = MODEL.input_shape[1]
        if len(seq) < seq_len:
            pad = np.ones(seq_len - len(seq)) * seq.mean()
            seq = np.concatenate([pad, seq])
        elif len(seq) > seq_len:
            seq = seq[-seq_len:]

        try:
            if hasattr(SCALER, 'transform'):
                scaled = SCALER.transform(seq.reshape(-1, 1)).reshape(-1)
                X = scaled.reshape((1, seq_len, 1))
                yhat = MODEL.predict(X)
                pred = float(SCALER.inverse_transform(yhat.reshape(-1, 1)).flatten()[0])
            else:
                max_val = SCALER.get('max', 1.0) if SCALER else 1.0
                scaled = seq / max_val
                X = scaled.reshape((1, seq_len, 1))
                yhat = MODEL.predict(X)
                pred = float(yhat.flatten()[0] * max_val)

            source = 'lstm_model'
        except Exception as e:
            app.logger.error('Optimize predict error: %s', e)
            pred = float(np.mean(history))
            source = 'fallback_mean'

    response = {
        'origin': origin,
        'destination': destination,
        'predicted_travel_time_min': pred,
        'prediction_source': source,
        'history_used': history
    }

    return jsonify(response)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'\n✅ Backend API running at http://localhost:{port}')
    print(f'📝 Update frontend BACKEND_URL to: http://localhost:{port}\n')
    app.run(host='0.0.0.0', port=port, debug=True)
