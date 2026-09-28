from fastapi import APIRouter
from fastapi import Query

from app.services.youtube_service import search_videos

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("/youtube")
async def youtube_resources(concept: str = Query(min_length=1, max_length=120),
                            sub_concept: str | None = Query(default=None, max_length=120)) -> dict:
    return await search_videos(concept, sub_concept)
