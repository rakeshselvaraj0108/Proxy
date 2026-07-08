from fastapi import APIRouter, Depends
from app.auth.dependencies import CurrentUser, get_current_user
from app.knowledge_graph.neo4j.service import knowledge_graph
from app.models.domain import Domain

router = APIRouter()


@router.get("/patterns")
async def institution_patterns(domain: Domain, institution_name: str, _: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return await knowledge_graph.find_institution_patterns(domain, institution_name)


@router.get("/citizen/{user_id}/profile")
async def citizen_profile(user_id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """Cross-domain traversal: every domain/institution/case linked to this
    citizen across all 8 domains (Enterprise Knowledge Graph)."""
    if current_user.role != "admin" and current_user.id != user_id:
        from app.core.errors import ProxyError
        raise ProxyError("Cannot view another citizen's cross-domain profile", status_code=403, code="forbidden")
    return await knowledge_graph.get_citizen_profile(user_id)
