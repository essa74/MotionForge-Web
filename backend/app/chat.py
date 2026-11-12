from typing import Literal

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import _authenticated_user_id
from app.config import settings

router = APIRouter(prefix="/chat", tags=["AI chat"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=24)


@router.post("/reply")
async def chat_reply(
    payload: ChatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _authenticated_user_id(request, authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="سجّل الدخول أولاً لاستخدام المساعد.")

    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="مفتاح Gemini غير مضبوط على الخادم.")

    contents = [
        {
            "role": "user" if turn.role == "user" else "model",
            "parts": [{"text": turn.content}],
        }
        for turn in payload.messages
    ]
    body = {
        "systemInstruction": {
            "parts": [{
                "text": (
                    "أنت EssaStudio AI، مساعد عربي متخصص في تحويل الأفكار إلى فيديوهات. "
                    "تحدث بالعربية المصرية الواضحة، وافهم سياق المحادثة وتذكر التعليمات السابقة. "
                    "ساعد في كتابة الفكرة والسيناريو وتقسيم المشاهد والـ prompts وخطط الصوت والصورة. "
                    "كن عملياً واسأل سؤالاً واحداً فقط عند الحاجة. "
                    "لا تدّعِ أنك أنشأت أو رندرت فيديو أو ملفاً ما لم تنفذ ذلك فعلياً."
                )
            }]
        },
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1800},
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                params={"key": settings.gemini_api_key},
                json=body,
            )
        if response.status_code >= 400:
            detail = "تعذر على Gemini معالجة الطلب حالياً."
            try:
                detail = response.json().get("error", {}).get("message", detail)
            except ValueError:
                pass
            raise HTTPException(status_code=502, detail=detail[:500])
        data = response.json()
        answer = "".join(
            part.get("text", "")
            for candidate in data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
            if part.get("text")
        ).strip()
        if not answer:
            raise HTTPException(status_code=502, detail="وصل رد فارغ من نموذج الذكاء الاصطناعي.")
        return {"reply": answer, "model": settings.gemini_model}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini استغرق وقتاً أطول من المتوقع. حاول مرة أخرى.") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="تعذر الاتصال بخدمة Gemini حالياً.") from None
