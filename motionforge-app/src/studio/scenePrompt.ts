/** The instruction sent to Gemini so that it answers with a scene list the engine can play. */
export function buildScenePrompt(args: { script: string; voiceSeconds: number | null; imageNames: string[]; format: string }) {
  const { script, voiceSeconds, imageNames, format } = args
  const length = voiceSeconds
    ? `طول الصوت ${voiceSeconds.toFixed(1)} ثانية. اجعل مجموع duration لكل المشاهد قبل مشهد اللوجو الأخير قريب من ${Math.max(1, voiceSeconds - 0).toFixed(0)} ثانية.`
    : 'لا يوجد صوت بعد: قدّر المدة من طول السكريبت (حوالي 2.5 كلمة في الثانية).'
  return `حوّل السكريبت التالي إلى قائمة مشاهد لريل ${format === 'vertical' ? 'طولي 9:16' : format === 'horizontal' ? 'عرضي 16:9' : 'مربع'}، وأجب بـ JSON فقط بدون أي شرح وبدون \`\`\`.

الشكل المطلوب:
{"scenes":[ ... ]}

أنواع المشاهد (كل مشهد له duration بالثواني، واختياري caption: نص قصير أو قائمة {text,from,to} بثواني نسبية لبداية المشهد):
1) {"type":"text","duration":3,"title":"...","subtitle":"...","theme":"light|dark|green"}
2) {"type":"excel","duration":9,"columns":[70,260,250,170],"rows":[["م","الاسم","القسم","الراتب"],["1","أحمد","المبيعات","8,500"]],"steps":[ ... ]}
   الصف الأول (rows[0]) هو العنوان، وأعمدة الجدول تبدأ من A. أضف صفوفاً فاضية لو هتكتب فيها.
   الخطوات (at بالثواني من بداية المشهد):
   - {"at":1,"do":"select","range":"D2:D6","over":1}  تحديد خلية أو نطاق
   - {"at":3,"do":"keys","keys":["Ctrl","A"],"hold":2.4}  إظهار مفاتيح الكيبورد
   - {"at":5,"do":"type","cell":"D7","text":"=SUM(D2:D6)","result":"39,500","over":1.5}  كتابة (والنتيجة تظهر في الخلية)
   - {"at":7,"do":"format","range":"C7:D7","fill":"#fff4c2","bold":true}  تلوين أو Bold
3) {"type":"image","duration":5,"src":"اسم ملف الصورة","motion":"zoom-in|zoom-out|pan-left|pan-right","title":"اختياري"}
   استخدم فقط أسماء الصور المتاحة${imageNames.length ? ': ' + imageNames.join(', ') : ' (لا توجد صور مرفوعة، فلا تستخدم هذا النوع)'}.
4) {"type":"logo","duration":3}  آخر مشهد دائماً.

قواعد:
- ابدأ بمشهد text يجذب الانتباه، وانهِ بمشهد logo.
- كل caption جملة قصيرة بالمصري (3 إلى 7 كلمات)، وتتزامن مع الكلام.
- مشاهد Excel تعرض الشرح خطوة بخطوة بنفس ترتيب كلام السكريبت. بيانات الجدول واقعية (أسماء موظفين، أقسام، مبالغ).
- ${length}

السكريبت:
${script.trim()}`
}

/** Pulls the first JSON object out of a reply that may include code fences or extra words. */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply)
  const body = fenced ? fenced[1] : reply
  const start = body.indexOf('{')
  if (start < 0) throw new Error('الرد مفيهوش JSON.')
  let depth = 0
  let inString = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1))
  }
  throw new Error('الـ JSON مش مكتمل.')
}
