from fastapi import APIRouter, Depends
from app.auth.dependencies import CurrentUser, get_current_user
from app.core.errors import ProxyError
from app.database.postgres.repositories import case_repository
from app.models.domain import ACTIVE_DOMAINS, Domain
from app.schemas.cases import CaseCreate, CaseEventCreate, CaseRead

router = APIRouter()


@router.post("", response_model=CaseRead)
async def create_case(payload: CaseCreate, user: CurrentUser = Depends(get_current_user)) -> dict:
    if payload.domain not in ACTIVE_DOMAINS:
        raise ProxyError(f"Domain '{payload.domain.value}' is registered but not active yet", status_code=409, code="domain_not_active")
    return await case_repository.create_case(user.id, payload)


@router.get("", response_model=list[CaseRead])
async def list_cases(domain: Domain | None = None, user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return await case_repository.list_cases(user.id, domain)


@router.get("/{case_id}", response_model=CaseRead)
async def get_case(case_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    case = await case_repository.get_case(case_id, user.id)
    if not case:
        raise ProxyError("Case not found", status_code=404, code="case_not_found")
    return case


@router.post("/{case_id}/events")
async def add_event(case_id: str, payload: CaseEventCreate, user: CurrentUser = Depends(get_current_user)) -> dict:
    case = await case_repository.get_case(case_id, user.id)
    if not case:
        raise ProxyError("Case not found", status_code=404, code="case_not_found")
    return await case_repository.add_event(case_id, payload.dict())

