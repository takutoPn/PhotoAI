from __future__ import annotations

import os
import uvicorn


def main() -> None:
    port = int(os.getenv("PHOTOAI_SHARE_PORT", "9000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, app_dir=".")


if __name__ == "__main__":
    main()
