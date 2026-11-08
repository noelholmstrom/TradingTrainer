#!/usr/bin/env python3
"""
Download Nasdaq-100 futures 1-minute bars from Databento and save a CSV that
TradingTrainer can import (Data menu -> Choose CSV file, or drop it on the chart).

Setup (once):
    pip install databento
    Create an account at databento.com (new accounts get free credits),
    copy your API key, then:
        macOS/Linux:  export DATABENTO_API_KEY=db-xxxxxxxxxxxxxxxx
        Windows:      setx DATABENTO_API_KEY db-xxxxxxxxxxxxxxxx   (then open a new terminal)

Usage:
    python fetch_nq_databento.py --start 2025-01-01 --end 2025-07-01
    python fetch_nq_databento.py --symbol MNQ --start 2024-06-01 --end 2024-09-01 --out mnq.csv

The script prints the cost estimate first and asks before it downloads anything.

Notes:
  * Data is the continuous front-month contract (NQ.v.0 / MNQ.v.0, which rolls to
    the next contract when its volume takes over). Prices jump on roll days; that
    does not matter for replaying one session at a time.
  * NQ and MNQ trade at the same price, so NQ data works for practising either.
  * Bars are timestamped at the start of the minute, in UTC. TradingTrainer
    converts them to New York time and groups them into Globex sessions
    (18:00 ET to 17:00 ET).
  * Databento's licence for this data covers your own use. Do not publish it.
"""
import argparse
import os
import sys


def to_trainer_csv(df, path):
    """Write a Databento OHLCV DataFrame as time,open,high,low,close,volume with ISO UTC times."""
    out = df[["open", "high", "low", "close", "volume"]].copy()
    idx = out.index
    if getattr(idx, "tz", None) is None:
        idx = idx.tz_localize("UTC")
    out.index = idx.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    out.index.name = "time"
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out.to_csv(path, float_format="%.2f")
    return len(out)


def main():
    ap = argparse.ArgumentParser(description="Download NQ or MNQ 1-minute bars from Databento for TradingTrainer.")
    ap.add_argument("--symbol", choices=["NQ", "MNQ"], default="NQ", help="contract (default NQ)")
    ap.add_argument("--start", required=True, help="first day, YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="day after the last day, YYYY-MM-DD")
    ap.add_argument("--out", help="output file (default <symbol>_1m_<start>_<end>.csv)")
    ap.add_argument("--yes", action="store_true", help="skip the cost confirmation")
    args = ap.parse_args()

    key = os.environ.get("DATABENTO_API_KEY")
    if not key:
        sys.exit("Set DATABENTO_API_KEY to your Databento API key first (see the notes at the top of this file).")

    try:
        import databento as db
    except ImportError:
        sys.exit("The databento package is missing. Install it with:  pip install databento")

    client = db.Historical(key)
    params = dict(
        dataset="GLBX.MDP3",
        symbols=[f"{args.symbol}.v.0"],
        stype_in="continuous",
        schema="ohlcv-1m",
        start=args.start,
        end=args.end,
    )

    cost = client.metadata.get_cost(**params)
    size = client.metadata.get_billable_size(**params)
    print(f"{args.symbol} 1-minute bars, {args.start} to {args.end}: about {size / 1e6:.1f} MB, estimated cost ${cost:.2f}")
    if not args.yes:
        if input("Download now? [y/N] ").strip().lower() not in ("y", "yes"):
            print("Nothing downloaded.")
            return

    data = client.timeseries.get_range(**params)
    df = data.to_df()
    if df.empty:
        sys.exit("Databento returned no bars for that range. Check the dates (weekends and holidays have none).")

    path = args.out or f"{args.symbol.lower()}_1m_{args.start}_{args.end}.csv"
    rows = to_trainer_csv(df, path)
    print(f"Saved {rows:,} bars to {path}. Import it in TradingTrainer from the Data menu.")


if __name__ == "__main__":
    main()
