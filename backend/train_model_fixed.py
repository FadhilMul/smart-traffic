import os
import json
import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler
import joblib

BASE_DIR = os.path.dirname(__file__)
MODEL_DIR = os.path.join(BASE_DIR, 'model')
os.makedirs(MODEL_DIR, exist_ok=True)

# Default sequence length used when building/reading sequences
SEQ_LEN = 10


def train(use_sequences=True, seq_len=SEQ_LEN, epochs=50, batch_size=64):
    """Train an LSTM model using sequence files if available.

    If sequence files `data/processed/X_seq.npy` and `y_seq.npy` are missing,
    the function will attempt to build them by importing `build_sequences`.
    Saves model as `model/lstm_model.h5`, scaler as `model/scaler.joblib`,
    and metadata as `model/metadata.json`.
    """

    seq_dir = os.path.join(BASE_DIR, 'data', 'processed')
    X_seq_path = os.path.join(seq_dir, 'X_seq.npy')
    y_seq_path = os.path.join(seq_dir, 'y_seq.npy')

    scaler = None

    # Ensure sequences exist (or try to build them)
    if use_sequences and (not os.path.exists(X_seq_path) or not os.path.exists(y_seq_path)):
        print('Sequence files not found; attempting to build sequences from raw CSV...')
        try:
            from build_sequences import build_sequences
            build_sequences(seq_len=seq_len)
        except Exception as e:
            print('Failed to build sequences:', e)

    # Load sequences if available
    if use_sequences and os.path.exists(X_seq_path) and os.path.exists(y_seq_path):
        print('Loading sequence dataset...')
        X = np.load(X_seq_path)
        y = np.load(y_seq_path)
        print('Loaded X:', X.shape, 'y:', y.shape)

        # Fit MinMaxScaler on all duration values in X (flattened) and y
        scaler = MinMaxScaler(feature_range=(0, 1))
        flat = X.reshape(-1, 1)
        scaler.fit(flat)

        X_scaled = scaler.transform(flat).reshape(X.shape[0], X.shape[1])
        y_scaled = scaler.transform(y.reshape(-1, 1)).reshape(-1)

        # reshape to (N, seq_len, 1)
        X_scaled = X_scaled.reshape((X_scaled.shape[0], X_scaled.shape[1], 1))
        seq_len = X_scaled.shape[1]

    else:
        # Fallback: small synthetic dataset for smoke testing
        print('Using synthetic dataset fallback')
        NUM_SAMPLES = 2000

        def generate_synthetic_sample():
            base = np.random.uniform(3, 60)
            t = np.arange(seq_len + 1)
            noise = np.random.normal(0, base * 0.05, size=seq_len + 1)
            season = 5 * np.sin(2 * np.pi * t / 24.0)
            seq = base + season + noise
            return seq[:-1], seq[-1]

        X_list = []
        y_list = []
        for _ in range(NUM_SAMPLES):
            xi, yi = generate_synthetic_sample()
            X_list.append(xi)
            y_list.append(yi)

        X = np.array(X_list)
        y = np.array(y_list)

        # Fit scaler on synthetic values
        scaler = MinMaxScaler(feature_range=(0, 1))
        flat = X.reshape(-1, 1)
        scaler.fit(flat)

        X_scaled = scaler.transform(flat).reshape(X.shape[0], X.shape[1])
        y_scaled = scaler.transform(y.reshape(-1, 1)).reshape(-1)
        X_scaled = X_scaled.reshape((X_scaled.shape[0], X_scaled.shape[1], 1))

    # Build LSTM model
    model = Sequential([
        LSTM(64, input_shape=(seq_len, 1), return_sequences=False),
        Dense(32, activation='relu'),
        Dense(1)
    ])

    model.compile(optimizer='adam', loss='mse')

    es = EarlyStopping(patience=5, restore_best_weights=True)

    model.fit(X_scaled, y_scaled, epochs=epochs, batch_size=batch_size, validation_split=0.1, callbacks=[es])

    # Save model
    model_path = os.path.join(MODEL_DIR, 'lstm_model.h5')
    model.save(model_path)

    # Save scaler (joblib) and metadata
    if scaler is not None:
        scaler_path = os.path.join(MODEL_DIR, 'scaler.joblib')
        try:
            joblib.dump(scaler, scaler_path)
        except Exception as e:
            print('Failed to dump scaler via joblib:', e)
            scaler_path = os.path.join(MODEL_DIR, 'scaler.json')
            scaler_info = {'seq_len': int(seq_len)}
            with open(scaler_path, 'w') as f:
                json.dump(scaler_info, f)
    else:
        scaler_path = os.path.join(MODEL_DIR, 'scaler.json')
        scaler_info = {'seq_len': int(seq_len)}
        with open(scaler_path, 'w') as f:
            json.dump(scaler_info, f)

    metadata = {
        'seq_len': int(seq_len),
        'model_file': os.path.basename(model_path),
        'scaler_file': os.path.basename(scaler_path),
        'num_samples': int(X.shape[0])
    }
    with open(os.path.join(MODEL_DIR, 'metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)

    print('Model saved to', model_path)
    print('Scaler saved to', scaler_path)
    print('Metadata saved to', os.path.join(MODEL_DIR, 'metadata.json'))


if __name__ == '__main__':
    train()