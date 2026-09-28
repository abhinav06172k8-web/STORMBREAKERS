from fastapi import APIRouter

from app.api import analytics, auth, exams, evaluations, learning, quizzes, resources, rubrics, submissions

api_router = APIRouter()
for route_module in (auth, exams, rubrics, submissions, evaluations, learning, quizzes, resources, analytics):
    api_router.include_router(route_module.router)
