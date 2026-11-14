from typing import Literal
import asyncio
import base64
import binascii
import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import _authenticated_user_id
from app.config import settings

router = APIRouter(prefix="/chat", tags=["AI chat"])
FALLBACK_MODEL = "gemini-3.5-flash-lite"
ADVANCED_MODEL = "gemini-3.8-flash"


# Simple in-memory per-user limiter (single API instance). Protects the shared Gemini quota.
RATE_LIMIT_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 600
_recent_requests: dict[str, deque[float]] = defaultdict(deque)


def _enforce_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    window = _recent_requests[user_id]
    while window and now - window[0] > RATE_LIMIT_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= RATE_LIMIT_REQUESTS:
        retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - window[0])) + 1
        raise HTTPException(
            status_code=429,
            detail="أرسلت رسائل كثيرة في وقت قصير. حاول مرة أخرى بعد قليل.",
            headers={"Retry-After": str(retry_after)},
        )
    window.append(now)


def _needs_advanced_model(messages: list["ChatTurn"]) -> bool:
    """Use the scarce advanced-model quota only for substantial coding work."""
    recent_user_text = " ".join(m.content.lower() for m in messages if m.role == "user")[-18000:]
    signals = (
        "اكتب كود", "اكتبلي كود", "برمج", "تطوير تطبيق", "تطوير موقع",
        "مشروع كامل", "ملفات المشروع", "راجع الكود", "حلل الكود",
        "debug", "refactor", "architecture", "full project", "codebase",
        "multi-file", "multiple files", "build an app", "build a website",
        "implement", "repository", "remotion", "react", "fastapi",
        "flask", "flutter", "next.js", "typescript", "python",
    )
    return any(signal in recent_user_text for signal in signals)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ImageAttachment(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(pattern=r"^image/(png|jpeg|webp|gif)$")
    data: str = Field(min_length=1, max_length=12_000_000)


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=24)
    attachments: list[ImageAttachment] = Field(default_factory=list, max_length=6)


@router.post("/reply")
async def chat_reply(
    payload: ChatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _authenticated_user_id(request, authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="سجّل الدخول أولاً لاستخدام المساعد.")
    _enforce_rate_limit(user_id)

    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="مفتاح Gemini غير مضبوط على الخادم.")

    contents = [
        {
            "role": "user" if turn.role == "user" else "model",
            "parts": [{"text": turn.content}],
        }
        for turn in payload.messages
    ]
    if payload.attachments:
        if not contents or contents[-1]["role"] != "user":
            raise HTTPException(status_code=400, detail="أرفق الصور مع رسالة جديدة من المستخدم.")
        for attachment in payload.attachments:
            try:
                image_bytes = base64.b64decode(attachment.data, validate=True)
            except (binascii.Error, ValueError):
                raise HTTPException(status_code=400, detail=f"ملف الصورة {attachment.name} غير صالح.") from None
            if len(image_bytes) > 8 * 1024 * 1024:
                raise HTTPException(status_code=413, detail=f"حجم الصورة {attachment.name} أكبر من 8 ميجابايت.")
            contents[-1]["parts"].append({"inline_data": {"mime_type": attachment.mime_type, "data": attachment.data}})

    body = {
        "systemInstruction": {
            "parts": [{
                "text": (
                    "أنت EssaStudio AI: مخرج إبداعي وكاتب سيناريو ومنتج محتوى قصير، ومساعد متخصص في تحويل الفكرة إلى خطة إنتاج قابلة للتنفيذ. "
                    "تحدث بالعربية المصرية الطبيعية والواضحة، إلا إذا طلب المستخدم لغة أخرى. لا تبدأ بتحيات مطولة ولا تكرر اسمك أو اسم المستخدم. "
                    "افهم سياق المحادثة واعتبر رسائل المستخدم السابقة تعليمات مستمرة ما لم يغيرها. لا تطلب معلومة ذكرها بالفعل. "
                    "إذا ذكر المستخدم موضوعاً أو موقعاً أو شخصية أو حقبة محددة في طلبه، فاعتبرها تحديداً كافياً وابدأ التنفيذ فوراً؛ لا تسأله مرة أخرى عن الموضوع أو الموقع. " +
                    "لا تطلب اختياراً من أمثلة أو قائمة عندما يكون المستخدم قد حدد اختياره بالفعل، ولا تجعل طلب التوضيح خطوة افتراضية قبل البحث أو الكتابة. " +
                    "إذا كان هناك نقص غير جوهري، اذكر افتراضك بوضوح وتابع العمل. اسأل سؤالاً واحداً فقط عندما يكون هناك غموض حقيقي يمنع تنفيذ المهمة، وليس لمجرد تحسين التفاصيل. "

                    "منهج العمل العام: افهم الهدف والجمهور والمنصة والمدة، ثم اختر زاوية واضحة. قدم أفضل نسخة عملية أولاً. "
                    "دورك يشمل تطوير الفكرة والـ Hook، كتابة السيناريو والتعليق الصوتي، تقسيم المشاهد بالثواني، وصف الصورة والحركة والكاميرا، "
                    "كتابة prompts مستقلة ودقيقة لأدوات الصور والفيديو، واقتراح المؤثرات الصوتية والانتقالات وخطة المونتاج والتصدير. "
                    "عند طلب فيديو، استخدم المدة والمنصة ونسبة الأبعاد إذا كانت معروفة. إذا لم يذكر المستخدم مدة، اقترح مدة مناسبة ولا توقف العمل بسؤال غير ضروري. "
                    "اجعل مجموع أزمنة المشاهد مطابقاً تماماً لمدة الفيديو. ولكل مشهد اذكر التوقيت والهدف والصورة والحركة والتعليق الصوتي والصوت والمؤثرات وPrompt بصرياً باللغة الإنجليزية عند فائدته. "
                    "لا تضع في التعليق الصوتي معلومة لا يدعمها مستوى الثقة الموضح في مرحلة التحقق. "

                    "بروتوكول إلزامي للموضوعات التاريخية والأثرية: قبل كتابة السيناريو، افصل المعلومات إلى: "
                    "(1) حقائق مدعومة بأدلة أو مصادر موثوقة، (2) تفسيرات أو فرضيات علمية/تاريخية، (3) أمور مختلف عليها أو غير محسومة، (4) ادعاءات شائعة لا يوجد ما يكفي لإثباتها. "
                    "لا تخلط بين هذه الفئات ولا تصغ الفرضية كأنها حقيقة. إذا لم تكن متأكداً من معلومة، قل بوضوح إنها تحتاج تحققاً ولا تخترع لها مصدراً أو تاريخاً أو رقماً أو اقتباساً. "
                    "لا تدّعِ أنك أجريت بحثاً مباشراً أو راجعت مصدراً الآن إذا لم تكن لديك أداة بحث متاحة في هذه المحادثة. "
                    "عندما لا تتوفر إمكانية البحث المباشر، اذكر أن التحقق المصدري غير مكتمل، وقدم فقط الصياغة الآمنة المعروفة، مع قائمة قصيرة بالمصادر أو أنواع المصادر التي ينبغي الرجوع إليها للتحقق لاحقاً. "
                    "عند توفر مصادر فعلية، فضّل الدراسات المحكمة، والكتب الأكاديمية، وتقارير الحفائر والمتاحف والجامعات والمؤسسات الأثرية الرسمية. "
                    "لا تنسب رأياً إلى عالم أو مؤسسة دون ثقة، ولا تختلق مراجع أو روابط. اربط كل ادعاء مهم بمصدره أو وضح أنه غير موثق. "
                    "تجنب التعميمات المطلقة مثل: كل العمال كانوا أحراراً، أو كلهم كانوا عبيداً، أو أن أمراً ما هو الأول أو الأعظم في التاريخ، إلا إذا كان الادعاء محدداً ومدعوماً بدليل مناسب. "
                    "ميّز بين وجود مقابر للعمال وبين الاستنتاجات الأوسع عن وضعهم الاجتماعي أو نظام أجورهم؛ فالدليل على أحدهما لا يثبت تلقائياً كل التفاصيل الأخرى. "
                    "لا تستخدم كلمة أحرار أو عبيد كحكم شامل على جميع العمال إلا إذا كان هناك دليل مباشر ومحدد؛ استخدم وصفاً أدق مثل فرق عمل منظمة أو عمالة دائمة وموسمية عندما يكون ذلك مدعوماً. " +
                    "لا تساوِ بين الحصص الغذائية والأجر النقدي؛ اشرح أن التعويض في الدولة القديمة قد يكون عينياً، ولا تقل إن العمال كانوا يقبضون أموالاً ما لم يوجد دليل صريح. " +
                    "لا تعتبر وجود مقابر أو طعام جيد دليلاً قاطعاً وحده على الحرية أو نفي السخرة؛ اعرضه كقرائن ضمن صورة أوسع، واذكر حدود ما تثبته. " +
                    "تحقق من تاريخ الموقع الأثري وطبقته الزمنية قبل ربطه مباشرة ببناء هرم خوفو؛ فقد تكون بعض منشآت ومساكن العمال المعروفة مرتبطة بمشروعات أهرام لاحقة. " +
                    "عند ذكر اكتشاف أثري، لا تنسبه لشخص واحد أو اثنين بصورة مبسطة؛ ميّز بين الاكتشاف الأولي والحفائر اللاحقة والتحليل العلمي، ولا تذكر أسماء إلا عند الثقة. " +
                    "استخدم المصطلحات الأثرية بدقة؛ إذا استخدمت مصطلحاً مثل phyle فاشرحه بوصفه تقسيم فريق/مجموعة عمل، ولا تخترع مقابلاً أو معنى غير متأكد منه. " +
                    "في التاريخ المصري القديم، راعِ الفروق بين الأسرات والعصور والمواقع، ولا تخلط ملابس أو أدوات أو عمارة أو رموز عصر بعصر آخر. "
                    "إذا كان الـ Hook مثيراً لكنه مضلل، استبدله بخطاف قوي ودقيق. "

                    "بروتوكول الإخراج البصري: اجعل كل Prompt محدداً في الحقبة والموقع والملابس والخامات والأدوات والعمارة والتكوين والإضاءة وحركة الكاميرا. "
                    "حافظ على اتساق الشخصيات والملابس والألوان والبيئة بين المشاهد المتصلة. أضف قيوداً تمنع الساعات والآلات الحديثة والأسلحة أو الملابس من عصور أخرى والنصوص المشوهة والعناصر غير التاريخية. "
                    "لا تجعل كل المشاهد مجرد لقطات عامة للأهرامات؛ اختر صورة تخدم المعلومة المحددة في المشهد. لا تطلب من مولد الفيديو كتابة نصوص عربية داخل الصورة؛ اقترح إضافتها في المونتاج. "

                    "تنسيق السيناريو التاريخي المفضل: ابدأ بعنوان وزاوية الفيديو، ثم قسم تحقق مختصر يوضح الحقائق والفرضيات والنقاط غير المحسومة، ثم السيناريو ومشاهد التوقيت، ثم prompts، ثم ملاحظات الإنتاج والمصادر/المراجع المقترحة. "
                    "إذا كان المستخدم يريد نسخة سريعة أو طلب تنسيقاً مختلفاً، اختصر مع الحفاظ على الدقة. "

                    "اجعل الـ prompts قابلة للنسخ، محددة وخالية من الحشو والتناقضات. اكتب باستخدام Markdown منظم: عناوين قصيرة وفقرات واضحة وقوائم عند الحاجة وكتل منفصلة للـ prompts. "
                    "كن عملياً ومباشراً، وقدم أفضل نسخة أولاً ثم ملاحظات التحسين المهمة فقط. اسأل سؤالاً واحداً فقط إذا كان نقص المعلومة يمنع التنفيذ. "
                    "لا تدّعِ أنك أنشأت أو رندرت فيديو أو صورة أو ملفاً أو نفذت إجراءً خارجياً ما لم تنفذ ذلك فعلياً."
                )
            }]
        },
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192},
    }

    # Keep the high-quota Lite model for everyday chat. Reserve 3.8 Flash
    # for substantial coding/project work, and automatically fail over on 429.
    advanced_task = _needs_advanced_model(payload.messages)
    models = (
        [ADVANCED_MODEL, settings.gemini_model, FALLBACK_MODEL]
        if advanced_task
        else [settings.gemini_model, ADVANCED_MODEL, FALLBACK_MODEL]
    )
    models = list(dict.fromkeys(model for model in models if model))
    last_detail = "خدمة Gemini مشغولة حالياً. حاول مرة أخرى بعد قليل."
    quota_exhausted = False
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            for model_index, model in enumerate(models):
                for attempt in range(2):
                    url = (
                        "https://generativelanguage.googleapis.com/v1beta/models/"
                        f"{model}:generateContent"
                    )
                    request_body = dict(body)
                    request_body["generationConfig"] = dict(body["generationConfig"])
                    if model == ADVANCED_MODEL:
                        # Gemini 3.8 uses thinking levels rather than legacy sampling controls.
                        request_body["generationConfig"].pop("temperature", None)
                        request_body["generationConfig"]["maxOutputTokens"] = 16384
                    try:
                        response = await client.post(
                            url,
                            params={"key": settings.gemini_api_key},
                            json=request_body,
                        )
                    except httpx.TimeoutException:
                        last_detail = "النموذج استغرق وقتاً أطول من المهلة المحددة."
                        if attempt == 0:
                            continue
                        break
                    if response.status_code == 503:
                        last_detail = "نموذج Gemini عليه ضغط مؤقت حالياً."
                        if attempt == 0:
                            await asyncio.sleep(1.5)
                            continue
                        break
                    if response.status_code == 429:
                        quota_exhausted = True
                        last_detail = "وصل هذا النموذج إلى حد الاستخدام المتاح حالياً."
                        break
                    if response.status_code >= 400:
                        detail = "تعذر على Gemini معالجة الطلب حالياً."
                        try:
                            detail = response.json().get("error", {}).get("message", detail)
                        except ValueError:
                            pass
                        # A model-specific availability/access error can move to fallback.
                        if response.status_code == 404:
                            last_detail = detail[:500]
                            break
                        raise HTTPException(status_code=502, detail=detail[:500])

                    data = response.json()
                    candidates = data.get("candidates", [])
                    candidate = candidates[0] if candidates else {}
                    answer = "".join(
                        part.get("text", "")
                        for part in candidate.get("content", {}).get("parts", [])
                        if part.get("text")
                    ).strip()
                    if not answer:
                        raise HTTPException(status_code=502, detail="وصل رد فارغ من نموذج الذكاء الاصطناعي.")
                    truncated = candidate.get("finishReason") == "MAX_TOKENS"
                    if truncated:
                        answer += "\n\n---\n**تنبيه:** وصل الرد إلى الحد الأقصى المسموح به وتم إيقافه. اكتب «كمّل من آخر نقطة» لاستكماله."
                    return {"reply": answer, "model": model, "truncated": truncated}

                # If the primary model is unavailable, continue with the fallback.
                continue

        if quota_exhausted:
            raise HTTPException(
                status_code=429,
                detail="استهلكت حصة النماذج المتاحة حالياً. جرّب لاحقاً بعد تجدد الحصة اليومية.",
            )
        raise HTTPException(
            status_code=503,
            detail=f"{last_detail} حاول مرة أخرى بعد دقيقة.",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini استغرق وقتاً أطول من المتوقع. حاول مرة أخرى.") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="تعذر الاتصال بخدمة Gemini حالياً.") from None
