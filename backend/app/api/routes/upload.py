from fastapi import APIRouter, Depends, File, UploadFile
from app.auth.dependencies import CurrentUser, get_current_user
from app.core.errors import ProxyError
from app.database.postgres.repositories import case_repository
from app.schemas.knowledge import DocumentUploadResponse
from app.storage.service import storage_service

router = APIRouter()


@router.post("/{case_id}/documents", response_model=DocumentUploadResponse)
async def upload_document(case_id: str, file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)) -> dict:
    case = await case_repository.get_case(case_id, user.id)
    if not case:
        raise ProxyError("Case not found", status_code=404, code="case_not_found")
    return await storage_service.save_case_document(user.id, case, file)


@router.get("/{case_id}/documents/{document_id}/signed-url")
async def get_document_signed_url(
    case_id: str,
    document_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    case = await case_repository.get_case(case_id, user.id)
    if not case:
        raise ProxyError("Case not found", status_code=404, code="case_not_found")
    documents = await case_repository.list_documents(case_id)
    document = next((item for item in documents if item.get("document_id") == document_id or item.get("id") == document_id), None)
    if not document:
        raise ProxyError("Document not found", status_code=404, code="document_not_found")
    signed_url = await storage_service.get_signed_download_url(user.id, case, document)
    return {"document_id": document_id, "signed_url": signed_url, "expires_in_seconds": 300}


@router.get("/{case_id}/documents")
async def list_documents(case_id: str, user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    case = await case_repository.get_case(case_id, user.id)
    if not case:
        raise ProxyError("Case not found", status_code=404, code="case_not_found")
    return await case_repository.list_documents(case_id)
