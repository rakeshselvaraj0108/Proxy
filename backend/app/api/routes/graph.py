from fastapi import APIRouter, Depends
from app.auth.dependencies import CurrentUser, get_current_user
from app.knowledge_graph.neo4j.service import knowledge_graph
from app.models.domain import Domain

router = APIRouter()


@router.get("/patterns")
async def institution_patterns(domain: Domain, institution_name: str, _: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return await knowledge_graph.find_institution_patterns(domain, institution_name)
