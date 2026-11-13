from typing import Literal
import asyncio

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import _authenticated_user_id
from app.config import settings

router = APIRouter(prefix="/chat", tags=["AI chat"])
FALLBACK_MODEL = "gemini-3.5-flash-lite"


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
                    "أنت EssaStudio AI: مخرج إبداعي وكاتب سيناريو ومنتج محتوى قصير، ومساعد متخصص في تحويل الفكرة إلى خطة إنتاج قابلة للتنفيذ. "
                    "تحدث بالعربية المصرية الطبيعية والواضحة، إلا إذا طلب المستخدم لغة أخرى. لا تبدأ بتحيات مطولة ولا تكرر اسمك أو اسم المستخدم. "
                    "افهم سياق المحادثة واعتبر رسائل المستخدم السابقة تعليمات مستمرة ما لم يغيرها. لا تطلب معلومة ذكرها بالفعل. "

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
                }
            }]
        },
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1800},
    }

    # Retry temporary capacity errors, then try a lighter model as a fallback.
    models = [settings.gemini_model]
    if FALLBACK_MODEL not in models:
        models.append(FALLBACK_MODEL)

    last_detail = "خدمة Gemini مشغولة حالياً. حاول مرة أخرى بعد قليل."
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            for model_index, model in enumerate(models):
                for attempt in range(2):
                    url = (
                        "https://generativelanguage.googleapis.com/v1beta/models/"
                        f"{model}:generateContent"
                    )
                    try:
                        response = await client.post(
                            url,
                            params={"key": settings.gemini_api_key},
                            json=body,
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
                    if response.status_code >= 400:
                        detail = "تعذر على Gemini معالجة الطلب حالياً."
                        try:
                            detail = response.json().get("error", {}).get("message", detail)
                        except ValueError:
                            pass
                        # A model-specific availability/access error can move to fallback.
                        if model_index == 0 and response.status_code in (404, 429):
                            last_detail = detail[:500]
                            break
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
                    return {"reply": answer, "model": model}

                # If the primary model is unavailable, continue with the fallback.
                continue

        raise HTTPException(
            status_code=503,
            detail=f"{last_detail} حاول مرة أخرى بعد دقيقة.",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini استغرق وقتاً أطول من المتوقع. حاول مرة أخرى.") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="تعذر الاتصال بخدمة Gemini حالياً.") from None
