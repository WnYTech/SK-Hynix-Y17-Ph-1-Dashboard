"""Run the API locally, or serve a React build behind nginx with --production."""

import argparse
import os
from pathlib import Path

import uvicorn


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Listen address (default: localhost)")
    parser.add_argument("--port", type=int, default=8017)
    parser.add_argument("--production", action="store_true",
                        help="Serve frontend/dist and API together, with auto-reload disabled")
    parser.add_argument("--proxy-ips", default="127.0.0.1",
                        help="Comma-separated trusted reverse proxy IP addresses")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if args.production:
        if not (root / "frontend" / "dist" / "index.html").is_file():
            parser.error("React build missing. Run npm run build from the repository root first.")
        os.environ["Y17_SERVE_FRONTEND"] = "1"
    uvicorn.run(
        "backend.app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.production,
        reload_dirs=[str(root / "backend")] if not args.production else None,
        proxy_headers=True,
        forwarded_allow_ips=args.proxy_ips,
    )
