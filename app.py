"""Start the local API server with: python3 app.py."""

from pathlib import Path

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "backend.app.main:app",
        host="127.0.0.1",
        port=8017,
        reload=True,
        reload_dirs=[str(Path(__file__).resolve().parent / "backend")],
    )
