from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ProxyError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = "proxy_error"):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProxyError)
    async def proxy_error_handler(_: Request, exc: ProxyError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Unexpected server error"}},
        )
