import os
import math
import numpy as np
import pandas as pd


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def build_sequences(raw_csv='data/raw/nyc_taxi_trip_duration.csv',
                    out_dir='data/processed', seq_len=10, max_total=200000):
    os.makedirs(out_dir, exist_ok=True)

    print('Loading raw CSV:', raw_csv)
    df = pd.read_csv(raw_csv, parse_dates=['pickup_datetime'])

    # create time features
    df['pickup_hour'] = df['pickup_datetime'].dt.hour
    df['pickup_dayofweek'] = df['pickup_datetime'].dt.dayofweek

    # compute distance (km)
    df['distance_km'] = df.apply(lambda r: haversine_distance(
        r['pickup_latitude'], r['pickup_longitude'], r['dropoff_latitude'], r['dropoff_longitude']), axis=1)

    df['duration_min'] = df['trip_duration'] / 60.0

    # filter
    df = df[(df['distance_km'] > 0.01) & (df['duration_min'] > 0.5) & (df['duration_min'] < 600)]
    df = df.dropna(subset=['pickup_datetime'])

    # route key by rounded coords (3 decimals ~100m-1km depending on lat)
    df['okey'] = df['pickup_latitude'].round(3).astype(str) + '_' + df['pickup_longitude'].round(3).astype(str)
    df['dkey'] = df['dropoff_latitude'].round(3).astype(str) + '_' + df['dropoff_longitude'].round(3).astype(str)
    df['route_key'] = df['okey'] + '|' + df['dkey']

    df = df.sort_values(['route_key', 'pickup_datetime'])

    X_seq = []
    y_seq = []
    total = 0

    grouped = df.groupby('route_key')
    print('Total route groups:', len(grouped))

    for k, g in grouped:
        durations = g['duration_min'].values
        n = len(durations)
        if n <= seq_len:
            continue
        # sliding windows
        for i in range(0, n - seq_len):
            if total >= max_total:
                break
            seq_x = durations[i:i+seq_len]
            seq_y = durations[i+seq_len]
            X_seq.append(seq_x)
            y_seq.append(seq_y)
            total += 1
        if total >= max_total:
            break

    X_seq = np.array(X_seq, dtype=float)
    y_seq = np.array(y_seq, dtype=float)

    print('Sequences built:', X_seq.shape, y_seq.shape)

    np.save(os.path.join(out_dir, 'X_seq.npy'), X_seq)
    np.save(os.path.join(out_dir, 'y_seq.npy'), y_seq)

    print('Saved sequence files to', out_dir)
    return X_seq, y_seq


if __name__ == '__main__':
    build_sequences()
