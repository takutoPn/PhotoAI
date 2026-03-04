from __future__ import annotations

import uvicorn
from app.main import app as fastapi_app


def main() -> None:
    # 直接importしてPyInstallerに app.main を確実に収集させる
    uvicorn.run(fastapi_app, host="127.0.0.1", port=8008)


if __name__ == "__main__":
    main()
